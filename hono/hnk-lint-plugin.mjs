import path from "node:path";

/**
 * 依存の向きを見る。grep は書かれた文字列を見るので `../` の数に縛られるが、
 * ここは解決したパスで判定するので、相対の深さが変わっても効き続ける
 */

const fileOf = (context) => context.filename ?? context.getFilename();

/** このファイルが属する feature 名。features/ の外なら undefined */
const featureOf = (file) => file.match(/[/\\]features[/\\]([^/\\]+)[/\\]/)?.[1];

/** 相対 import だけ解決する。パッケージやエイリアスは対象外 */
const resolveRelative = (file, specifier) =>
  specifier.startsWith(".") ? path.resolve(path.dirname(file), specifier) : null;

/** 解決先が features/<name>/<layer> なら、その組を返す */
const layerAt = (resolved, layer) =>
  resolved?.match(new RegExp(`[/\\\\]features[/\\\\]([^/\\\\]+)[/\\\\]${layer}$`))?.[1];

/** route.ts か。features 配下のものだけを見る */
const isRouteFile = (file) => /[/\\]features[/\\][^/\\]+[/\\]route\.ts$/.test(file);

/**
 * 式の根まで降りて `new Hono()` かどうかを見る。
 * `new Hono<AppEnv>().get(...).post(...)` はチェーンなので、
 * CallExpression と MemberExpression を剥がしてから判定する
 */
const rootsAtNewHono = (node) => {
  let cur = node;
  while (cur) {
    if (cur.type === "CallExpression") cur = cur.callee;
    else if (cur.type === "MemberExpression") cur = cur.object;
    else break;
  }
  return cur?.type === "NewExpression" && cur.callee?.name === "Hono";
};

/** その export 宣言が Hono インスタンスそのものか */
const isTheRouteExport = (node) =>
  node.exportKind !== "type" &&
  node.declaration?.type === "VariableDeclaration" &&
  node.declaration.declarations.length === 1 &&
  rootsAtNewHono(node.declaration.declarations[0].init);

const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

/**
 * 部分木を歩く。入れ子の関数には降りない——中の await や c.json は
 * その関数のものであって、今見ているハンドラのものではない
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

/** `c.json(...)` の呼び出しか */
const isCJson = (node) =>
  node.type === "CallExpression" &&
  node.callee?.type === "MemberExpression" &&
  node.callee.object?.name === "c" &&
  node.callee.property?.name === "json";

const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "all"]);

/**
 * guard の名前。SKILL.md の「guard は要求するものの名前を持つ」に乗るので、
 * 維持するリストを持たない。requireAdmin を足しても規則の変更は要らない
 */
const isGuardName = (node) =>
  node?.type === "Identifier" && /^(require|allow)[A-Z]/.test(node.name);

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
      message: (t) =>
        `service が他 feature を連れている（${t}）。読みなら route から、書きなら相手の usecases/ から`,
    }),

    /**
     * route.ts の公開面は mount する 1 本だけ。ヘルパを export すると
     * 他 feature がそこから掴めてしまい、mount チェーンが公開 API の一覧でなくなる
     */
    "route-exports-only-the-route": {
      create(context) {
        const file = fileOf(context);
        if (!isRouteFile(file)) return {};

        const report = (node) =>
          context.report({
            node,
            message:
              "route.ts が Hono インスタンス以外を export している。組み立てヘルパはこのファイル内に留める",
          });

        return {
          ExportNamedDeclaration(node) {
            if (!isTheRouteExport(node)) report(node);
          },
          ExportDefaultDeclaration: report,
          ExportAllDeclaration: report,
        };
      },
    },

    /**
     * 応答を組み立てながら待たない。ハンドラは「取り出す → 処理する → 返す」の 3 段で、
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
              if (FUNCTIONS.has(arg.type)) continue; // ハンドラ本体は別の scope
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
     * 成功の形は 1 つ。空を早期 return で分けると 2 つの成功形が union になり、
     * items: [] が never[] に推論されてフロント側のファイルにエラーが出る。
     * 「空である理由」は分岐ではなく数——service が数を一緒に返し、presenter が訳す
     */
    "one-c-json-per-handler": {
      create(context) {
        if (!isRouteFile(fileOf(context))) return {};

        const check = (node) => {
          const found = [];
          walkOwnScope(node.body, (inner) => {
            if (isCJson(inner)) found.push(inner);
          });
          for (const extra of found.slice(1)) {
            context.report({
              node: extra,
              message: `1 つのハンドラに c.json が ${found.length} 個ある。空である理由は分岐ではなく数で表す`,
            });
          }
        };

        return {
          ArrowFunctionExpression: check,
          FunctionExpression: check,
        };
      },
    },

    /**
     * let は最後の逃げ道。契約型で注釈してあれば、2 つの成功形が黙って union に
     * なることは無くなる。注釈の無い let は推論に任せているということ
     */
    "let-needs-a-contract-type": {
      create(context) {
        if (!isRouteFile(fileOf(context))) return {};

        return {
          VariableDeclaration(node) {
            if (node.kind !== "let") return;
            for (const declarator of node.declarations) {
              if (!declarator.id?.typeAnnotation) {
                context.report({
                  node: declarator,
                  message:
                    "注釈の無い let。避けられないなら契約型を書く。書けるなら数で表して const にする",
                });
              }
            }
          },
        };
      },
    },

    /**
     * 認証について決めたことを opener に書かせる。
     *
     * guard を落としても、handler が authUserId を読まなければ tsc は通る
     * (読むなら never になって落ちる)。読まない handler —— 所有者で絞らない集計など ——
     * では、書き忘れが無認証の公開として静かに出ていく。
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
            const method = node.callee?.property?.name;
            if (node.callee?.type !== "MemberExpression") return;
            if (!ROUTE_METHODS.has(method)) return;
            // service の .get() などと区別する。チェーンの根が new Hono() のものだけ
            if (!rootsAtNewHono(node.callee.object)) return;
            if (node.arguments.length < 2) return; // path のみの形は扱わない

            const guards = node.arguments.filter(isGuardName);

            if (guards.length === 0) {
              context.report({
                node,
                message: `.${method}() に認証の指定が無い。requireAuth か、公開なら allowAnonymous を置く`,
              });
              return;
            }
            if (guards.length > 1) {
              context.report({
                node: guards[1],
                message: `.${method}() に認証の指定が ${guards.length} 個ある。1 つに決める`,
              });
            }
            if (node.arguments[1] !== guards[0]) {
              context.report({
                node: guards[0],
                message: `認証の指定は path の直後に置く。opener を縦に読めるようにするため`,
              });
            }
          },
        };
      },
    },

    "lib-stays-portable": {
      create(context) {
        const file = fileOf(context);
        if (!/[/\\]lib[/\\]/.test(file)) return {};

        return {
          ImportDeclaration(node) {
            const resolved = resolveRelative(file, node.source.value);
            if (/[/\\](features|middleware|db)[/\\]/.test(resolved ?? "")) {
              context.report({
                node,
                message: "lib/ は次のプロジェクトへ cp -r できるもの。この依存があると持ち出せない",
              });
            }
          },
        };
      },
    },
  },
};

export default plugin;
