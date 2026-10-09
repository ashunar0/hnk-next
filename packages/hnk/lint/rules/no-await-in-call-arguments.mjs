import { FUNCTIONS, isHttpInbound, walkOwnScope } from "../ast.mjs";
import { fileOf } from "../project.mjs";

/**
 * 応答を組み立てながら待たない。handler は「取り出す → 処理する → 返す」の 3 段で、
 * await は 2 段目に閉じる。引数の中に混ざると、返す式が何を待っているのか読めなくなる
 */
export default {
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
                message:
                  "呼び出しの引数の中で待っている。await は変数に受けてから渡す",
              });
            }
          });
        }
      },
    };
  },
};
