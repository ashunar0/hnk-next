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
 * modules/<m>/<role>.ts → { module, role }。何に繋ぐかの技術名は落とす（repo.d1 → repo、webhook.stripe → webhook）。
 * modules/<m>/commands/<name>.ts → { module, role: "commands" }。
 * api 直下の決めごと（errors, middleware, db, env, deps）→ { role }
 */
const placeOf = (resolved, root) => {
  const rel = path
    .relative(root, resolved)
    .replace(/\\/g, "/")
    .replace(/\.tsx?$/, "")
    .replace(/\/index$/, "");
  let m;
  if ((m = rel.match(/^api\/modules\/([^/]+)\/(.+)$/))) {
    const [, module, rest] = m;
    // テストは役割の外。何を import してもよい
    if (/\.(test|typetest|spec)$/.test(rest)) return { module, role: "test" };
    if (rest.startsWith("commands/") && !rest.slice("commands/".length).includes("/"))
      return { module, role: "commands" };
    if (!rest.includes("/")) return { module, role: rest.split(".")[0] };
    return { module, role: rest };
  }
  if ((m = rel.match(/^api\/(errors|env|deps|db)$/))) return { role: m[1] };
  if (rel.startsWith("api/middleware/")) return { role: "middleware" };
  return { role: rel };
};

/** HTTP の inbound か（routes と webhook）。createRouter の束を書く場所 */
const isHttpInbound = (file) => /[/\\]modules[/\\][^/\\]+[/\\](routes|webhook(\.[^/\\]+)?)\.ts$/.test(file);

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
 * module の中の役割と、それが core / inbound / outbound のどれか。
 * ここに無い名前のファイルは module の中に置けない（layer-imports が止める）
 */
const KINDS = {
  domain: "core",
  service: "core",
  commands: "core",
  routes: "inbound",
  webhook: "inbound",
  cron: "inbound",
  queue: "inbound",
  repo: "outbound",
  gateway: "outbound",
  mailer: "outbound",
  jobs: "outbound",
};

/**
 * 役割ごとに、import してよい相手。ここに無いものは全部だめ。
 * "type" は `import type` だけ許す。実行時には依存せず、形だけを借りる。
 *
 * 矢印は全部 core に向かう。domain は外を何も知らない。
 * service は手順で、outbound の形を宣言する。outbound はその形を満たす。
 * inbound は誰として呼ぶかを決め、deps から core を受け取って呼ぶ。
 *
 * 相手の書き方:
 *   パッケージ名（hnk, hnk/result, zod, drizzle-orm）
 *   自分の module の役割（domain, service, ...）。他の module のものは "foreign:<role>"
 *   アプリの決めごと（errors, middleware, db, deps）
 */
const LAYERS = {
  // core
  domain: { zod: "value", "foreign:domain": "type" },
  service: { "hnk/result": "value", domain: "value", "foreign:domain": "type" },
  // 他の module に変えさせてよい操作。使う outbound の形は service の宣言を借りる
  commands: { "hnk/result": "value", domain: "value", service: "type", "foreign:domain": "type" },

  // inbound（HTTP）
  routes: { hnk: "value", zod: "value", errors: "value", middleware: "value", domain: "value" },
  // 利用者のいない HTTP。誰として呼ぶか（systemViewer）を他 module の domain から借りる
  webhook: {
    hnk: "value",
    zod: "value",
    errors: "value",
    middleware: "value",
    domain: "value",
    "foreign:domain": "value",
  },
  // inbound（HTTP 以外）。deps を受け取り、システムとして呼ぶ
  cron: { deps: "type", domain: "type", "foreign:domain": "value" },
  queue: { deps: "type", domain: "type", "foreign:domain": "value" },

  // outbound
  repo: {
    "drizzle-orm": "value",
    db: "type",
    domain: "value",
    service: "type",
    "foreign:repo": "value",
    // 集計の SQL で、他 module の状態の集合（billedStatuses など）を使う
    "foreign:domain": "value",
  },
  gateway: { "hnk/result": "value", domain: "type", service: "type" },
  mailer: { "hnk/result": "value", domain: "type", service: "type" },
  jobs: { domain: "type", service: "type" },
};

/** よくある間違いには、どうすればいいかを添える */
const HINTS = {
  "domain→service": "domain はモノとルールだけ。手順は service に置く",
  "domain→hnk/result": "domain は失敗を返す手順を持たない。手順は service に置く",
  "service→routes": "service は HTTP を知らない。失敗は Result のコードで返し、番号は routes が決める",
  "service→hnk": "service が hnk から使ってよいのは Result だけ。hnk/result から import する",
  "service→foreign:service":
    "他の module は import しない。使う形を service に宣言し、deps.ts でつなぐ。書くなら相手の commands/ を渡してもらう",
  "routes→foreign:domain": "routes は認証した利用者として呼ぶ。システムとして呼べるのは利用者のいない inbound だけ",
  "routes→foreign:service": "他の module の操作は、その流れの持ち主の service から呼ぶ",
  "repo→foreign:service": "読みは自分の repo の join で（相手の repo からテーブルを import してよい）",
};

/** 向きの間違いは、役割の組ではなく core / inbound / outbound の組で説明できる */
const KIND_HINTS = {
  "core→outbound": "core は outbound を知らない。必要な形は service に type で宣言し、outbound がそれを満たす",
  "core→inbound": "core は inbound を知らない。失敗は Result のコードで返し、HTTP の番号などは inbound が決める",
  "inbound→outbound": "inbound は outbound を知らない。deps から core を受け取って呼ぶ",
  "inbound→core": "inbound は service や commands を import しない。deps から受け取って呼ぶ",
  "outbound→inbound": "outbound は inbound を知らない",
};

/** foreign:domain → 他 module の domain */
const show = (name) => name.replace(/^foreign:/, "他 module の ");

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
     * Go は package の境界が向きを強制するが、ここでは 1 つの module フォルダに
     * 役割が同居しているので、ファイル名の約束を機械で止める
     */
    "layer-imports": {
      create(context) {
        const file = fileOf(context);
        const project = projectOf(file);
        if (!project) return {};
        const self = placeOf(file, project.root);
        if (self.role === "test") return {};
        const allowed = LAYERS[self.role];
        if (!allowed) {
          if (!self.module) return {};
          // module の中に、役割の分からないファイルを置かせない
          return {
            Program(node) {
              context.report({
                node,
                message: `module の中のファイルは、役割の名前で始める（${Object.keys(KINDS).join(", ")}）。外へ繋ぐものは「役割.技術名.ts」（repo.d1.ts など）`,
              });
            },
          };
        }

        const check = (node) => {
          if (!node.source) return;
          const specifier = node.source.value;
          const resolved = resolveImport(file, specifier, project);

          let target;
          if (resolved === null) target = packageOf(specifier);
          else {
            const place = placeOf(resolved, project.root);
            const foreign = place.module && place.module !== self.module;
            target = foreign ? `foreign:${place.role}` : place.role;
          }
          const kind = allowed[target];
          const targetRole = target.replace(/^foreign:/, "");
          const hint =
            HINTS[`${self.role}→${target}`] ??
            (KINDS[targetRole] && !target.startsWith("foreign:")
              ? KIND_HINTS[`${KINDS[self.role]}→${KINDS[targetRole]}`]
              : undefined);
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
     * 他の module の表（xxxTable）は、外部キーの references() の中でだけ使う。
     * 読むときは、持ち主が出している範囲付きの読み（invoicesWithin など）を通す。
     * 表を直接 from に書けると、範囲（組織）の条件を付け忘れる書き方ができてしまう
     */
    "no-foreign-table-reads": {
      create(context) {
        const file = fileOf(context);
        const project = projectOf(file);
        if (!project) return {};
        const self = placeOf(file, project.root);
        if (!self.module || self.role === "test") return {};

        /** 外部キーの references(...) の引数の中か */
        const insideReferences = (ancestors) =>
          ancestors.some(
            (a) =>
              a.type === "CallExpression" &&
              a.callee?.type === "MemberExpression" &&
              a.callee.property?.name === "references",
          );

        return {
          Program(program) {
            // 他 module の repo から import した、表の名前
            const tables = new Map();
            for (const node of program.body) {
              if (node.type !== "ImportDeclaration") continue;
              const resolved = resolveImport(file, node.source.value, project);
              if (resolved === null) continue;
              const place = placeOf(resolved, project.root);
              if (!place.module || place.module === self.module || place.role !== "repo") continue;
              for (const spec of node.specifiers) {
                if (spec.type === "ImportSpecifier" && /Table$/.test(spec.local.name)) {
                  tables.set(spec.local.name, place.module);
                }
              }
            }
            if (tables.size === 0) return;

            const visit = (node, ancestors) => {
              if (!node || typeof node.type !== "string") return;
              if (node.type === "ImportDeclaration") return;
              if (node.type === "Identifier" && tables.has(node.name) && !insideReferences(ancestors)) {
                context.report({
                  node,
                  message: `他の module の表 ${node.name} を読みに使っている。表は外部キーの references() の中でだけ使う。読むときは ${tables.get(node.name)} が出している範囲付きの読み（〜Within）を使う`,
                });
              }
              for (const [key, value] of Object.entries(node)) {
                if (key === "parent") continue;
                for (const child of Array.isArray(value) ? value : [value]) {
                  visit(child, [...ancestors, node]);
                }
              }
            };
            visit(program, []);
          },
        };
      },
    },

    /**
     * routes.ts の公開面は mount する 1 本だけ。ヘルパを export すると
     * 他 module がそこから掴めてしまい、mount チェーンが公開 API の一覧でなくなる
     */
    "route-exports-only-the-router": {
      create(context) {
        if (!isHttpInbound(fileOf(context))) return {};

        const report = (node) =>
          context.report({
            node,
            message: "routes.ts が createRouter() の束以外を export している。組み立てヘルパはこのファイル内に留める",
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
        if (!isHttpInbound(fileOf(context))) return {};

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
        if (!isHttpInbound(fileOf(context))) return {};

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
        if (!isHttpInbound(fileOf(context))) return {};

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
