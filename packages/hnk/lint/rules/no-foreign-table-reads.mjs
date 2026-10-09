import { fileOf, placeOf, projectOf, resolveImport } from "../project.mjs";

/**
 * 他の module の表（xxxTable）は、外部キーの references() の中でだけ使う。
 * 読むときは、持ち主が出している範囲付きの読み（invoicesWithin など）を通す。
 * 表を直接 from に書けると、範囲（組織）の条件を付け忘れる書き方ができてしまう
 */
export default {
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
          if (
            !place.module ||
            place.module === self.module ||
            place.role !== "repo"
          )
            continue;
          for (const spec of node.specifiers) {
            if (
              spec.type === "ImportSpecifier" &&
              /Table$/.test(spec.local.name)
            ) {
              tables.set(spec.local.name, place.module);
            }
          }
        }
        if (tables.size === 0) return;

        const visit = (node, ancestors) => {
          if (!node || typeof node.type !== "string") return;
          if (node.type === "ImportDeclaration") return;
          if (
            node.type === "Identifier" &&
            tables.has(node.name) &&
            !insideReferences(ancestors)
          ) {
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
};
