import { unwrap } from "../ast.mjs";
import { isHttpInbound } from "../ast.mjs";
import { fileOf } from "../project.mjs";

const propOf = (object, name) =>
  object?.properties?.find(
    (p) =>
      p.type === "Property" &&
      ((p.key?.type === "Identifier" && p.key.name === name) ||
        (p.key?.type === "Literal" && p.key.value === name)),
  );

/**
 * 一覧の route は、件数の上限を持つ（query を pageQuerySchema で包む）。
 *
 * 上限の無い一覧は、データが増えたある日、応答の大きさや CPU 時間の上限で突然落ちる。
 * 後から付けると応答の形も変わる。pageQuerySchema は limit に既定と上限を持つので、
 * 使えば「上限の無い一覧」を書く道が無くなる。
 *
 * 一覧かどうかは、型なしで見分けられる範囲で決める: get で、path の最後が :param でないもの。
 * 包んでいるかは構文で見る: query が pageQuerySchema(...) の呼び出しか、同じファイルでそれを入れた変数。
 * 文字列の一致では見ないので、名前やコメントに pageQuerySchema と書いてあっても通らない
 * 件数が別の所で決まっている（月ごとの集計など）なら、この行の上に
 * `// oxlint-disable-next-line hnk/route-lists-are-paged -- 理由` を書く。
 * 例外が多くて困るなら、このルールを外す
 */
export default {
  create(context) {
    if (!isHttpInbound(fileOf(context))) return {};

    // 同じファイルの変数が何で作られているか（query のスキーマを辿るため）
    const declared = new Map();
    const isPageQuery = (node) =>
      node?.type === "CallExpression" &&
      node.callee?.type === "Identifier" &&
      node.callee.name === "pageQuerySchema";

    return {
      VariableDeclarator(node) {
        if (node.id?.type === "Identifier" && node.init)
          declared.set(node.id.name, unwrap(node.init));
      },
      CallExpression(node) {
        if (
          node.callee?.type !== "MemberExpression" ||
          node.callee.property?.name !== "endpoint"
        )
          return;
        const config = unwrap(node.arguments[0]);
        if (config?.type !== "ObjectExpression") return;

        const method = unwrap(propOf(config, "method")?.value);
        const path = unwrap(propOf(config, "path")?.value);
        if (method?.value !== "get" || typeof path?.value !== "string") return;
        if (/:[^/]+$/.test(path.value)) return;

        const request = unwrap(propOf(config, "request")?.value);
        const query = unwrap(propOf(request, "query")?.value);
        const schema =
          query?.type === "Identifier" ? declared.get(query.name) : query;
        if (isPageQuery(schema)) return;

        context.report({
          node: propOf(config, "path"),
          message:
            "一覧の route に件数の上限が無い。query を pageQuerySchema(絞り込みのスキーマ) で包む（応答は pageResponseSchema と pageResponse）。query のスキーマは同じファイルに置く。件数が別の所で決まっているなら、この行の上に `// oxlint-disable-next-line hnk/route-lists-are-paged -- 理由` を書く",
        });
      },
    };
  },
};
