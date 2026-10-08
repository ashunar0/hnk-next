import path from "node:path";

/**
 * hnk の形を守らせる oxlint のプラグイン。アプリの .oxlintrc.json で
 * `"jsPlugins": ["hnk/lint"]` として読み込む
 */

const fileOf = (context) => context.filename ?? context.getFilename();

/** このファイルが属する feature 名。features/ の外なら undefined */
const featureOf = (file) => file.match(/[/\\]features[/\\]([^/\\]+)[/\\]/)?.[1];

/** 相対 import だけ解決する。パッケージやエイリアスは対象外 */
const resolveRelative = (file, specifier) =>
  specifier.startsWith(".") ? path.resolve(path.dirname(file), specifier) : null;

/** 解決先が features/<name>/<layer> なら、その feature 名を返す */
const layerAt = (resolved, layer) =>
  resolved?.match(new RegExp(`[/\\\\]features[/\\\\]([^/\\\\]+)[/\\\\]${layer}$`))?.[1];

/** route.ts か。features 配下のものだけを見る */
const isRouteFile = (file) => /[/\\]features[/\\][^/\\]+[/\\]route\.ts$/.test(file);

/** `as const` や `satisfies` を剥がす */
const unwrap = (node) => {
  let cur = node;
  while (cur && (cur.type === "TSAsExpression" || cur.type === "TSSatisfiesExpression")) cur = cur.expression;
  return cur;
};

/**
 * 式の根まで降りて `createRouter()` かどうかを見る。
 * `createRouter().openapi(...).openapi(...)` はチェーンなので、
 * CallExpression と MemberExpression を剥がしてから判定する
 */
const rootsAtCreateRouter = (node) => {
  let cur = node;
  let last;
  while (cur) {
    if (cur.type === "CallExpression") {
      last = cur;
      cur = cur.callee;
    } else if (cur.type === "MemberExpression") cur = cur.object;
    else break;
  }
  return cur?.type === "Identifier" && cur.name === "createRouter" && last?.callee === cur;
};

/**
 * guard の名前。「guard は要求するものの名前を持つ」に乗るので、
 * 維持するリストを持たない。requireAdmin を足しても規則の変更は要らない
 */
const isGuardName = (node) => node?.type === "Identifier" && /^(require|allow)[A-Z]/.test(node.name);

const foreignLayerRule = ({ layer, appliesTo, message }) => ({
  create(context) {
    const file = fileOf(context);
    const self = featureOf(file);
    if (!self) return {};
    if (appliesTo && !appliesTo.test(file)) return {};

    return {
      ImportDeclaration(node) {
        const target = layerAt(resolveRelative(file, node.source.value), layer);
        if (target && target !== self) {
          context.report({ node, message: message(target) });
        }
      },
    };
  },
});

const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

/**
 * 部分木を歩く。入れ子の関数には降りない——中の await は
 * その関数のものであって、今見ている呼び出しのものではない
 */
const walkOwnScope = (node, visit) => {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (!child || typeof child.type !== "string") continue;
      if (FUNCTIONS.has(child.type)) continue;
      walkOwnScope(child, visit);
    }
  }
};

const RESPONSE_METHODS = new Set(["json", "text", "body", "html", "redirect"]);

const plugin = {
  meta: { name: "hnk" },
  rules: {
    "no-foreign-repository": foreignLayerRule({
      layer: "repository",
      message: (t) =>
        `他 feature の storage に手を伸ばしている（${t}）。読みは自分の repository の join で、書きは相手の usecases/ で`,
    }),

    "no-foreign-service-from-service": foreignLayerRule({
      layer: "service",
      appliesTo: /[/\\]service\.ts$/,
      message: (t) => `service が他 feature を連れている（${t}）。読みなら route から、書きなら相手の usecases/ から`,
    }),

    /**
     * route.ts の公開面は mount する 1 本だけ。ヘルパを export すると
     * 他 feature がそこから掴めてしまい、mount チェーンが公開 API の一覧でなくなる
     */
    "route-exports-only-the-router": {
      create(context) {
        if (!isRouteFile(fileOf(context))) return {};

        const report = (node) =>
          context.report({
            node,
            message: "route.ts が createRouter() の束以外を export している。組み立てヘルパはこのファイル内に留める",
          });

        return {
          ExportNamedDeclaration(node) {
            const ok =
              node.exportKind !== "type" &&
              node.declaration?.type === "VariableDeclaration" &&
              node.declaration.declarations.length === 1 &&
              rootsAtCreateRouter(node.declaration.declarations[0].init);
            if (!ok) report(node);
          },
          ExportDefaultDeclaration: report,
          ExportAllDeclaration: report,
        };
      },
    },

    /**
     * 応答を組み立てながら待たない。handler は「取り出す → 処理する → 返す」の 3 段で、
     * await は 2 段目に閉じる。引数の中に混ざると、返す式が何を待っているのか読めなくなる
     */
    "no-await-in-call-arguments": {
      create(context) {
        if (!isRouteFile(fileOf(context))) return {};

        // 入れ子の呼び出しでは同じ await が外側と内側の両方から見える
        const reported = new Set();

        return {
          CallExpression(node) {
            for (const arg of node.arguments) {
              if (FUNCTIONS.has(arg.type)) continue; // handler 本体は別の scope
              walkOwnScope(arg, (inner) => {
                if (inner.type === "AwaitExpression" && !reported.has(inner)) {
                  reported.add(inner);
                  context.report({
                    node: inner,
                    message: "呼び出しの引数の中で待っている。await は変数に受けてから渡す",
                  });
                }
              });
            }
          },
        };
      },
    },

    /**
     * route では reply で返す。c.json でも動くが、宣言とずれたときの赤線が
     * 間違えた値ではなく handler の頭に付き、何を直せばいいかが読めなくなる
     */
    "route-replies-through-reply": {
      create(context) {
        if (!isRouteFile(fileOf(context))) return {};

        return {
          CallExpression(node) {
            const callee = node.callee;
            if (callee?.type !== "MemberExpression") return;
            if (callee.object?.type !== "Identifier" || callee.object.name !== "c") return;
            const method = callee.property?.name;
            if (!RESPONSE_METHODS.has(method)) return;
            context.report({
              node,
              message: `c.${method}() ではなく reply で返す。reply(200, body) か reply.failure(error)`,
            });
          },
        };
      },
    },

    /**
     * service は、自分が使う repository の形を自分で宣言する（使う側が interface を決める）。
     * repository.ts を import すると向きが逆になり、service が保存の実装を知ってしまう
     */
    "service-declares-its-repository": {
      create(context) {
        const file = fileOf(context);
        if (!/[/\\]features[/\\][^/\\]+[/\\]service\.ts$/.test(file)) return {};

        return {
          ImportDeclaration(node) {
            const resolved = resolveRelative(file, node.source.value);
            if (resolved && /[/\\]repository(\.ts)?$/.test(resolved)) {
              context.report({
                node,
                message:
                  "service が repository を import している。必要な保存の形は service に type で宣言し、repository がそれを満たす",
              });
            }
          },
        };
      },
    },

    /**
     * モジュールの一番上に、変わる状態を置かない。Workers では 1 つの isolate が
     * 同時に複数のリクエストを捌くので、ここに置いたものは全リクエストで共有され、
     * 別の利用者のデータが混ざる。リクエストごとのものは makeDeps か c に置く
     */
    "no-module-scope-state": {
      create(context) {
        const MUTABLE = new Set(["Map", "Set", "WeakMap", "WeakSet", "Array"]);

        return {
          Program(program) {
            for (const statement of program.body) {
              const declaration =
                statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
              if (declaration?.type !== "VariableDeclaration") continue;

              if (declaration.kind !== "const") {
                context.report({
                  node: declaration,
                  message: `モジュールの一番上の ${declaration.kind}。同時リクエストで共有されるので、変わる値は置かない`,
                });
                continue;
              }
              for (const declarator of declaration.declarations) {
                const init = unwrap(declarator.init);
                if (init?.type === "NewExpression" && MUTABLE.has(init.callee?.name)) {
                  context.report({
                    node: declarator,
                    message: `モジュールの一番上の new ${init.callee.name}()。同時リクエストで共有されるので、中身が変わる入れ物は置かない`,
                  });
                }
              }
            }
          },
        };
      },
    },

    /**
     * 認証について決めたことを宣言に書かせる。
     *
     * guard を落としても、handler が authUserId を読まなければ tsc は通る。
     * 読まない handler —— 所有者で絞らない集計など —— では、書き忘れが
     * 無認証の公開として静かに出ていく。
     *
     * 公開したいときは allowAnonymous を書く。「書いていない」が
     * 「忘れた」と「公開したい」の両方を意味するのをやめる。
     * どちらが正しいかは機械には分からないが、grep allowAnonymous で列挙はできる
     */
    "route-declares-auth": {
      create(context) {
        if (!isRouteFile(fileOf(context))) return {};

        return {
          CallExpression(node) {
            if (node.callee?.type !== "Identifier" || node.callee.name !== "createRoute") return;
            const config = unwrap(node.arguments[0]);
            if (config?.type !== "ObjectExpression") return;

            const middleware = config.properties.find(
              (p) => p.type === "Property" && p.key?.type === "Identifier" && p.key.name === "middleware",
            );
            const list = unwrap(middleware?.value);
            const elements = list?.type === "ArrayExpression" ? list.elements : list ? [list] : [];
            const guards = elements.filter(isGuardName);

            if (guards.length === 0) {
              context.report({
                node,
                message:
                  "createRoute に認証の指定が無い。middleware: [requireAuth] か、公開なら [allowAnonymous] を置く",
              });
              return;
            }
            if (guards.length > 1) {
              context.report({ node: guards[1], message: `認証の指定が ${guards.length} 個ある。1 つに決める` });
            }
            if (elements[0] !== guards[0]) {
              context.report({
                node: guards[0],
                message: "認証の指定は middleware の先頭に置く。宣言を縦に読めるようにするため",
              });
            }
          },
        };
      },
    },
  },
};

export default plugin;
