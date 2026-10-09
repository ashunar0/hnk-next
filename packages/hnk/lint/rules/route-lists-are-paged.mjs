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
 * 一覧の route は、件数の上限を持つ（query に pageQuery を展開する）。
 *
 * 上限の無い一覧は、データが増えたある日、応答の大きさや CPU 時間の上限で突然落ちる。
 * 後から付けると応答の形も変わる。pageQuery は limit に既定と上限を持つので、
 * 使えば「上限の無い一覧」を書く道が無くなる。
 *
 * 一覧かどうかは、型なしで見分けられる範囲で決める: get で、path の最後が :param でないもの。
 * 件数が別の所で決まっている（月ごとの集計など）なら、この行の上に
 * `// oxlint-disable-next-line hnk/route-lists-are-paged -- 理由` を書く。
 * 例外が多くて困るなら、このルールを外す
 */
export default {
  create(context) {
    if (!isHttpInbound(fileOf(context))) return {};

    // 同じファイルの変数が何で作られているか（query のスキーマを辿るため）
    const declared = new Map();

    return {
      VariableDeclarator(node) {
        if (node.id?.type === "Identifier" && node.init)
          declared.set(node.id.name, context.sourceCode.getText(node.init));
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
        const text =
          query?.type === "Identifier"
            ? (declared.get(query.name) ?? "")
            : query
              ? context.sourceCode.getText(query)
              : "";
        if (text.includes("pageQuery")) return;

        context.report({
          node: propOf(config, "path"),
          message:
            "一覧の route に件数の上限が無い。query に ...pageQuery を展開する（応答は pageResponse）。件数が別の所で決まっているなら、この行の上に `// oxlint-disable-next-line hnk/route-lists-are-paged -- 理由` を書く",
        });
      },
    };
  },
};
