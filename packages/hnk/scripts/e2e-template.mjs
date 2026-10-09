/**
 * 雛形の通し確認。空のディレクトリに hnk init → g module → pnpm install → db:generate → pnpm check を通す。
 * テンプレートは別々のファイルだが、組み合わせて初めて型・lint・テストが通る。それをここで守る。
 * 使い方: node scripts/e2e-template.mjs [module 名...]（既定は invoices と signupRequests。複数形と camelCase の置き換えを確かめる）
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../bin/hnk.mjs");
const modules = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["invoices", "signupRequests"];

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hnk-e2e-"));
const app = path.join(dir, "demo-app");

const run = (command, args, cwd) => {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  const { status } = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (status !== 0) {
    console.error(`\n失敗: ${command} ${args.join(" ")}（${cwd}）`);
    process.exit(1);
  }
};

run("node", [cli, "init", app], dir);
for (const name of modules) run("node", [cli, "g", "module", name], app);
run("pnpm", ["install"], app);
run("pnpm", ["db:generate"], app);
run("pnpm", ["exec", "prettier", "--write", "."], app);
run("pnpm", ["check"], app);

console.log(`\n通った（${app}）`);
