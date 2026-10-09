/**
 * hnk の本体（src/）について、文書で言っていることを機械で確かめる。注記だけだと、いつかずれる。
 * - 依存は hono だけ。スキーマのライブラリ（zod、valibot など）は import しない
 * - 型を信じてもらう書き方（`as never` / `as unknown as`）は、下の表の場所と数だけ
 */
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const src = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
);
/** src の下の全ての .ts（サブディレクトリも）。src からの相対パス */
const files = fs
  .readdirSync(src, { recursive: true })
  .filter(
    (f) => /\.[cm]?[tj]sx?$/.test(f) && fs.statSync(path.join(src, f)).isFile(),
  );

/** コメントを除いた行 */
const codeOf = (file) =>
  fs
    .readFileSync(path.join(src, file), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*\*|\*)/.test(line))
    .join("\n");

test("依存は hono だけ（ほかは src の中の相対 import）", () => {
  for (const file of files) {
    // from "x"（import / export）、import "x"、import("x")、require("x")、' も `x` も
    const found = codeOf(file).matchAll(
      /(?:\bfrom|\bimport|\brequire)\s*\(?\s*(["'`])([^"'`]+)\1/g,
    );
    for (const [, , specifier] of found) {
      assert.ok(
        specifier.startsWith("./") ||
          specifier === "hono" ||
          specifier.startsWith("hono/"),
        `${file} が ${specifier} を import している。hnk の依存は hono だけにする（スキーマは Standard Schema で受け取る）`,
      );
    }
  }
});

/**
 * 型を信じてもらう場所と、その理由。ここに無い場所で書いたら落ちる。
 * 増やすときは、この表に理由と一緒に足す
 */
const CASTS = {
  // provideDeps の c.set と、handler の c.get: 内部のキー（DEPS_KEY）は、アプリの Env の変数に載せない。
  // errorResponses の戻り値: 実行時に組み立てた object に、番号ごとの失敗の型を付ける。
  // handler の中の reply と fn(c, ...): route の型が決まらないここでは、Hono のジェネリクスを照らし合わせきれない
  "endpoint.ts": 10,
  // .endpoint の中の Hono の on と戻り値: 型は引数の宣言で守られていて、Hono の on はここでは照らし合わせきれない
  "router.ts": 2,
  // 登録された handler に貼った宣言（ROUTE）を読む。Hono の handler の型は、hnk の印を知らない
  "openapi.ts": 1,
};

test("as never / as unknown as は、決めた場所と数だけ", () => {
  for (const file of files) {
    const count = [...codeOf(file).matchAll(/as never|as unknown as/g)].length;
    assert.equal(
      count,
      CASTS[file] ?? 0,
      `${file} の as never / as unknown as が ${count} 個（決めた数は ${CASTS[file] ?? 0}）。型で守れる書き方にするか、test/source.test.mjs の表に理由と一緒に足す`,
    );
  }
});
