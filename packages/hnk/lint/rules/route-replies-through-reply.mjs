import { isHttpInbound } from "../ast.mjs";
import { fileOf } from "../project.mjs";

const RESPONSE_METHODS = new Set(["json", "text", "body", "html", "redirect"]);

/**
 * route では reply で返す。c.json でも動くが、宣言とずれたときの赤線が
 * 間違えた値ではなく handler の頭に付き、何を直せばいいかが読めなくなる
 */
export default {
  create(context) {
    if (!isHttpInbound(fileOf(context))) return {};

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee?.type !== "MemberExpression") return;
        if (callee.object?.type !== "Identifier" || callee.object.name !== "c")
          return;
        const method = callee.property?.name;
        if (!RESPONSE_METHODS.has(method)) return;
        context.report({
          node,
          message: `c.${method}() ではなく reply で返す。reply(200, body) か reply.failure(error)`,
        });
      },
    };
  },
};
