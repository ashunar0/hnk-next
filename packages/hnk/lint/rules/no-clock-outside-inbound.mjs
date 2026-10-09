import { KINDS } from "../layers.mjs";
import { fileOf, placeOf, projectOf } from "../project.mjs";

/**
 * 時計を読むのは inbound だけ。core と outbound は、入口が決めた now を引数で受け取る。
 *
 * cron と queue では createWorker が「いつの出来事か」を渡すのに、service が自分で
 * new Date() を呼ぶと、同じ手順が入口によって違う時計で動く。テストでも時刻を固定できない。
 * 引数の付いた new Date(value) は時計ではなく変換なので止めない
 */
export default {
  create(context) {
    const file = fileOf(context);
    const project = projectOf(file);
    if (!project) return {};
    const self = placeOf(file, project.root);
    const kind = KINDS[self.role];
    if (!self.module || (kind !== "core" && kind !== "outbound")) return {};

    const report = (node, what) =>
      context.report({
        node,
        message: `${self.role} が時計を読んでいる（${what}）。今の時刻は入口が決める。引数で now を受け取る（routes と webhook は handler の new Date()、cron と queue は createWorker が渡す now）`,
      });

    return {
      NewExpression(node) {
        if (
          node.callee?.type === "Identifier" &&
          node.callee.name === "Date" &&
          node.arguments.length === 0
        )
          report(node, "new Date()");
      },
      CallExpression(node) {
        if (
          node.callee?.type === "MemberExpression" &&
          node.callee.object?.type === "Identifier" &&
          node.callee.object.name === "Date" &&
          node.callee.property?.name === "now"
        )
          report(node, "Date.now()");
      },
    };
  },
};
