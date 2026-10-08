import fs from "node:fs";
import path from "node:path";

/**
 * hnk の形を守らせる oxlint のプラグイン。アプリの .oxlintrc.json で
 * `"jsPlugins": ["hnk/lint"]` として読み込む
 */

const fileOf = (context) => context.filename ?? context.getFilename();

/** 一番近い tsconfig.json のあるディレクトリと、その paths。アプリの根として使う */
const projectCache = new Map();
const projectOf = (file) => {
  let dir = path.dirname(file);
  while (true) {
    if (projectCache.has(dir)) return projectCache.get(dir);
    const tsconfig = path.join(dir, "tsconfig.json");
    if (fs.existsSync(tsconfig)) {
      const { compilerOptions } = JSON.parse(fs.readFileSync(tsconfig, "utf8"));
      const project = { root: dir, paths: compilerOptions?.paths ?? {} };
      projectCache.set(dir, project);
      return project;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

/** import 先をファイルの絶対パスに解決する。相対 import と tsconfig の paths。パッケージなら null */
const resolveImport = (file, specifier, project) => {
  if (specifier.startsWith(".")) return path.resolve(path.dirname(file), specifier);
  for (const [alias, [target]] of Object.entries(project.paths)) {
    const prefix = alias.replace(/\*$/, "");
    if (alias.endsWith("*") ? specifier.startsWith(prefix) : specifier === alias) {
      return path.resolve(project.root, target.replace("*", specifier.slice(prefix.length)));
    }
  }
  return null;
};

/** パッケージ名。`drizzle-orm/d1` は `drizzle-orm`、`@hono/zod-openapi` はそのまま。hnk だけは入口ごとに分ける */
const packageOf = (specifier) => {
  if (specifier === "hnk" || specifier.startsWith("hnk/")) return specifier;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
};

/**
 * アプリの中のファイルを、役割で見る。
 * features/<f>/<role>.ts → { feature, role }、contract/<f>/<name>.ts → { contract, role: "contract/<name>" }、
 * api 直下の決めごと（errors, middleware, db, env, deps）→ { role }
 */
const placeOf = (resolved, root) => {
  const rel = path
    .relative(root, resolved)
    .replace(/\\/g, "/")
    .replace(/\.tsx?$/, "")
    .replace(/\/index$/, "");
  let m;
  if ((m = rel.match(/^api\/features\/([^/]+)\/([^/]+)$/))) return { feature: m[1], role: m[2] };
  if ((m = rel.match(/^contract\/([^/]+)\/([^/]+)$/))) return { contract: m[1], role: `contract/${m[2]}` };
  if ((m = rel.match(/^api\/(errors|env|deps|db)$/))) return { role: m[1] };
  if (rel.startsWith("api/middleware/")) return { role: "middleware" };
  return { role: rel };
};

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

/**
 * 役割ごとに、import してよい相手。ここに無いものは全部だめ。
 * "type" は `import type` だけ許す。実行時には依存せず、形だけを借りる
 *
 * 相手の書き方:
 *   パッケージ名（hnk, hnk/result, zod, drizzle-orm）
 *   自分の feature の役割（table, service, presenter）
 *   他の feature の役割は "foreign:<role>"
 *   アプリの決めごと（errors, middleware, db）
 *   自分の feature の contract（contract/schema, contract/model）
 */
const LAYERS = {
  route: {
    hnk: "value",
    "contract/schema": "value",
    errors: "value",
    middleware: "value",
    presenter: "value",
  },
  presenter: { "contract/schema": "type", table: "type" },
  service: { "hnk/result": "value", "contract/model": "type", table: "type" },
  repository: {
    "drizzle-orm": "value",
    db: "type",
    table: "value",
    "foreign:table": "value",
    service: "type",
  },
  table: { "drizzle-orm": "value" },
  "contract/schema": { zod: "value", "contract/model": "value" },
  "contract/model": { zod: "value" },
};

/** よくある間違いには、どうすればいいかを添える */
const HINTS = {
  "service→repository": "必要な保存の形は service に type で宣言し、repository がそれを満たす",
  "service→foreign:service": "読みなら route から、2 つ以上の feature に書くなら usecases/ を作る",
  "service→foreign:repository": "読みなら自分の repository の join で、2 つ以上の feature に書くなら usecases/ を作る",
  "repository→foreign:repository": "読みは自分の repository の join で（相手の table を import してよい）",
  "route→repository": "route は保存を知らない。service を deps から受け取って呼ぶ",
  "route→table": "行の形は presenter が知っている。route は presenter を呼ぶ",
  "route→zod": "入出力の形は contract の schema に置く",
  "service→zod": "ルールを service で使うなら contract の model に置く",
  "service→hnk": "service が hnk から使ってよいのは Result だけ。hnk/result から import する",
};

/** foreign:service → 他 feature の service */
const show = (name) => name.replace(/^foreign:/, "他 feature の ");

const isTypeOnly = (node) =>
  node.importKind === "type" || (node.specifiers?.length > 0 && node.specifiers.every((s) => s.importKind === "type"));

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
    /**
     * 役割ごとの依存の向きを、許可の表（LAYERS）で守らせる。
     * Go は package の境界が向きを強制するが、ここでは 1 つの feature フォルダに
     * 役割が同居しているので、ファイル名の約束を機械で止める
     */
    "layer-imports": {
      create(context) {
        const file = fileOf(context);
        const project = projectOf(file);
        if (!project) return {};
        const self = placeOf(file, project.root);
        const allowed = LAYERS[self.role];
        if (!allowed) return {};

        const check = (node) => {
          if (!node.source) return;
          const specifier = node.source.value;
          const resolved = resolveImport(file, specifier, project);

          let target;
          if (resolved === null) target = packageOf(specifier);
          else {
            const place = placeOf(resolved, project.root);
            // 自分の feature 名。contract/invoices も features/invoices と同じ持ち主として見る
            const own = self.feature ?? self.contract;
            const foreign = (place.feature && place.feature !== own) || (place.contract && place.contract !== own);
            target = foreign ? `foreign:${place.role}` : place.role;
          }
          const kind = allowed[target];
          const hint = HINTS[`${self.role}→${target}`];
          if (!kind) {
            const list = Object.entries(allowed)
              .map(([k, v]) => (v === "type" ? `${show(k)}（型だけ）` : show(k)))
              .join(", ");
            context.report({
              node,
              message: `${self.role} が ${show(target)} を import している。${hint ? `${hint}。` : ""}${self.role} が import してよいのは ${list}`,
            });
          } else if (kind === "type" && !isTypeOnly(node)) {
            context.report({
              node,
              message: `${self.role} は ${show(target)} から型だけを借りる。import type にする`,
            });
          }
        };

        return {
          ImportDeclaration: check,
          ExportNamedDeclaration: check,
          ExportAllDeclaration: check,
        };
      },
    },

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
              const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
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
              context.report({
                node: guards[1],
                message: `認証の指定が ${guards.length} 個ある。1 つに決める`,
              });
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
