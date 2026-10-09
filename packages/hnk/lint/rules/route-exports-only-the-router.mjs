import { isHttpInbound, rootsAtCreateRouter } from "../ast.mjs";
import { fileOf } from "../project.mjs";

/**
 * routes.ts の公開面は mount する 1 本だけ。ヘルパを export すると
 * 他 module がそこから掴めてしまい、mount チェーンが公開 API の一覧でなくなる
 */
export default {
  create(context) {
    if (!isHttpInbound(fileOf(context))) return {};

    const report = (node) =>
      context.report({
        node,
        message:
          "routes.ts が createRouter() の束以外を export している。組み立てヘルパはこのファイル内に留める",
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
};
