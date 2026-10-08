/**
 * 配線のスモークテスト。deps の getter は互いを呼ぶので、module の依存に輪ができると
 * 実行時に無限再帰になる。全部を 1 回ずつ読んで、組み上がることだけを確かめる
 */
import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { makeDeps } from "../api/deps";

it("deps の全部が組み上がる", () => {
  const deps = makeDeps(env);

  for (const name of Object.keys(deps)) {
    expect(deps[name as keyof typeof deps], name).toBeDefined();
  }
});
