import fs from "node:fs";
import path from "node:path";

export const fileOf = (context) => context.filename ?? context.getFilename();

/** 一番近い tsconfig.json のあるディレクトリと、その paths。アプリの根として使う */
export const projectCache = new Map();
export const projectOf = (file) => {
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
export const resolveImport = (file, specifier, project) => {
  if (specifier.startsWith("."))
    return path.resolve(path.dirname(file), specifier);
  for (const [alias, [target]] of Object.entries(project.paths)) {
    const prefix = alias.replace(/\*$/, "");
    if (
      alias.endsWith("*") ? specifier.startsWith(prefix) : specifier === alias
    ) {
      return path.resolve(
        project.root,
        target.replace("*", specifier.slice(prefix.length)),
      );
    }
  }
  return null;
};

/** パッケージ名。`drizzle-orm/d1` は `drizzle-orm`、`@hono/zod-openapi` はそのまま。hnk だけは入口ごとに分ける */
export const packageOf = (specifier) => {
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
export const placeOf = (resolved, root) => {
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
    if (
      rest.startsWith("commands/") &&
      !rest.slice("commands/".length).includes("/")
    )
      return { module, role: "commands" };
    if (!rest.includes("/")) return { module, role: rest.split(".")[0] };
    return { module, role: rest };
  }
  if ((m = rel.match(/^api\/(errors|env|deps|db)$/))) return { role: m[1] };
  if (rel.startsWith("api/middleware/")) return { role: "middleware" };
  return { role: rel };
};
