import { fileOf, placeOf, projectOf } from "../project.mjs";

/**
 * ID の印（InvoiceId など）を `as` で付けない。印を付けてよいのは、その ID を持つ module の
 * domain が出している作る関数（invoiceId(value)）だけ。あちこちで as を書けると、
 * 取り違えを型で止める意味がなくなる。domain 自身の中（作る関数の定義）は許す
 */
export default {
  create(context) {
    const file = fileOf(context);
    const project = projectOf(file);
    if (!project) return {};
    const self = placeOf(file, project.root);
    if (self.role === "domain" || self.role === "test") return {};

    return {
      TSAsExpression(node) {
        const type = node.typeAnnotation;
        if (type?.type !== "TSTypeReference") return;
        const name = type.typeName?.name;
        if (!name || !/Id$/.test(name)) return;
        context.report({
          node,
          message: `${name} を as で付けている。ID の印は domain の作る関数(${name[0].toLowerCase()}${name.slice(1)}(value))で付ける`,
        });
      },
    };
  },
};
