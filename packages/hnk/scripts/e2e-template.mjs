/**
 * 雛形の通し確認。空のディレクトリに hnk init → g module → pnpm install → db:generate → pnpm check を通す。
 * テンプレートは別々のファイルだが、組み合わせて初めて型・lint・テストが通る。それをここで守る。
 * 使い方: node scripts/e2e-template.mjs [--packed] [module 名...]（既定は invoices と signupRequests。複数形と camelCase の置き換えを確かめる）
 *   既定は手元の hono-kit を link: でつなぐ。--packed は pnpm pack した tgz を展開し、その中の CLI と dist で通す（npm に出す物そのもの）
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const packed = args.includes("--packed");
const names = args.filter((a) => a !== "--packed");
const modules = names.length > 0 ? names : ["invoices", "signupRequests"];

// シンボリックリンクを解いておく（/var → /private/var のような所で、pnpm の解決がずれないように）
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "hnk-e2e-")));
const app = path.join(dir, "demo-app");

const run = (command, args, cwd, env) => {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  const { status } = spawnSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
  if (status !== 0) {
    console.error(`\n失敗: ${command} ${args.join(" ")}（${cwd}）`);
    process.exit(1);
  }
};

let cli = path.join(root, "bin/hnk.mjs");
let spec = `link:${fs.realpathSync(root)}`;
if (packed) {
  run("pnpm", ["pack", "--pack-destination", dir], root);
  const tgz = fs.readdirSync(dir).find((f) => f.endsWith(".tgz"));
  run("tar", ["xzf", tgz], dir);
  cli = path.join(dir, "package/bin/hnk.mjs");
  spec = `file:${path.join(dir, tgz)}`;
}

run("node", [cli, "init", app], dir, { HNK_SPEC: spec });
for (const name of modules) run("node", [cli, "g", "module", name], app);
run("pnpm", ["install"], app);
run("pnpm", ["db:generate"], app);
run("pnpm", ["exec", "prettier", "--write", "."], app);
run("pnpm", ["check"], app);

console.log(`\n通った（${app}）`);
