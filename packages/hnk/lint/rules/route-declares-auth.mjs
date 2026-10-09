import { isGuardName, isHttpInbound, unwrap } from "../ast.mjs";
import { fileOf } from "../project.mjs";

/**
 * 認証について決めたことを宣言に書かせる。
 *
 * guard を落としても、handler が actor を読まなければ tsc は通る。
 * 読まない handler —— 所有者で絞らない集計など —— では、書き忘れが
 * 無認証の公開として静かに出ていく。
 *
 * 公開したいときは allowAnonymous を書く。「書いていない」が
 * 「忘れた」と「公開したい」の両方を意味するのをやめる。
 * どちらが正しいかは機械には分からないが、grep allowAnonymous で列挙はできる
 */
export default {
  create(context) {
    if (!isHttpInbound(fileOf(context))) return {};

    return {
      CallExpression(node) {
        if (
          node.callee?.type !== "Identifier" ||
          node.callee.name !== "createEndpoint"
        )
          return;
        const config = unwrap(node.arguments[0]);
        if (config?.type !== "ObjectExpression") return;

        const middleware = config.properties.find(
          (p) =>
            p.type === "Property" &&
            p.key?.type === "Identifier" &&
            p.key.name === "middleware",
        );
        const list = unwrap(middleware?.value);
        const elements =
          list?.type === "ArrayExpression" ? list.elements : list ? [list] : [];
        const guards = elements.filter(isGuardName);

        if (guards.length === 0) {
          context.report({
            node,
            message:
              "createEndpoint に認証の指定が無い。middleware: [requireAuth] か、公開なら [allowAnonymous] を置く",
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
            message:
              "認証の指定は middleware の先頭に置く。宣言を縦に読めるようにするため",
          });
        }
      },
    };
  },
};
