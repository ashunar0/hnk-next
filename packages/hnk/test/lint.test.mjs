/**
 * lint ルールのテスト。fixtures/app の各ファイルは、わざと違反を書いてある。
 * 先頭の `// expect: <ルール> | <メッセージの一部>` が、そのファイルに出るべき指摘。
 * メッセージは AI への指示なので、メッセージの一部も固定する。
 * 指摘の数は expect の数と一致する（余計な指摘が出たら落ちる）。expect の無いファイルは 0 件
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, "fixtures", "app");
const oxlint = path.join(here, "..", "node_modules", ".bin", "oxlint");

const run = () => {
  let stdout;
  try {
    stdout = execFileSync(
      oxlint,
      ["-c", ".oxlintrc.json", "--format", "json", "."],
      {
        cwd: app,
        encoding: "utf8",
      },
    );
  } catch (error) {
    // 指摘があると終了コードが 1 になる。JSON は stdout に出ている
    stdout = error.stdout;
    if (!stdout) throw error;
  }

  return JSON.parse(stdout).diagnostics;
};

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

const expectations = (file) =>
  [
    ...fs.readFileSync(file, "utf8").matchAll(/^\/\/ expect: (.+?) \| (.+)$/gm),
  ].map((m) => ({
    rule: m[1],
    message: m[2],
  }));

const diagnostics = run();
const files = walk(path.join(app, "api")).filter((f) => f.endsWith(".ts"));

for (const file of files) {
  const rel = path.relative(app, file);
  const expected = expectations(file);
  const actual = diagnostics.filter(
    (d) => path.resolve(app, d.filename) === file,
  );

  test(rel, () => {
    assert.equal(
      actual.length,
      expected.length,
      `指摘の数が違う。出た指摘:\n${actual.map((d) => `${d.code}: ${d.message}`).join("\n")}`,
    );
    for (const e of expected) {
      assert.ok(
        actual.some((d) => d.code === e.rule && d.message.includes(e.message)),
        `${e.rule} | ${e.message} が出ていない。出た指摘:\n${actual.map((d) => `${d.code}: ${d.message}`).join("\n")}`,
      );
    }
  });
}
