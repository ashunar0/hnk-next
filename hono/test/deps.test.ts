/**
 * 配線のスモークテスト。全部を組み上げて、必要な service が揃っていることだけを確かめる。
 * module の依存の輪は、makeDeps が const を上から順に並べているので、tsc が止める
 * （宣言の前に使うとコンパイルが通らない）。ここでは実行時の確認だけをする
 */
import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { makeDeps } from "../api/deps";

it("deps の全部が組み上がる", () => {
  const deps = makeDeps(env);

  expect(Object.keys(deps).sort()).toEqual(["invoices", "payments", "reminders", "reports"]);
  for (const name of Object.keys(deps)) {
    expect(deps[name as keyof typeof deps], name).toBeDefined();
  }
});

it("同じ service は 1 回の組み立てで 1 つだけ（呼ぶたびに作り直さない）", () => {
  const deps = makeDeps(env);

  expect(deps.invoices).toBe(deps.invoices);
});
