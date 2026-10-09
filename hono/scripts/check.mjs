/**
 * pnpm check。全部の確認を順に回し、途中で落ちても止めずに、最後に失敗を一覧で出す。
 * 型が落ちたときに lint の指摘が見えない、を避けるため（直せる量が分からなくなる）
 */
import { spawnSync } from "node:child_process";

const steps = [
  ["typecheck", ["pnpm", "typecheck"]],
  ["lint", ["pnpm", "lint"]],
  ["format:check", ["pnpm", "format:check"]],
  ["test", ["pnpm", "test"]],
  ["hnk の lint ルールのテスト", ["pnpm", "-C", "../packages/hnk", "test"]],
  ["README の許可表", ["pnpm", "-C", "../packages/hnk", "readme:check"]],
];

const failed = [];
for (const [name, [command, ...args]] of steps) {
  console.log(`\n── ${name} ──`);
  const { status } = spawnSync(command, args, { stdio: "inherit" });
  if (status !== 0) failed.push(name);
}

if (failed.length > 0) {
  console.error(`\n失敗: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("\n全部通った");
