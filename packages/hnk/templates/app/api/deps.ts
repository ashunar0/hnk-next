import { wireDb } from "./db";
import type { AppEnv } from "./env";
// hnk:imports

/**
 * module の組み立て方を集める唯一の場所（composition root）。
 *
 * 組み立てた結果ではなく、組み立て方を buildApp に渡す。hnk の provideDeps が
 * リクエストごとに（handler が初めて受け取るときに 1 回）呼ぶ。HTTP 以外の inbound は createWorker が呼ぶ。
 * db はリクエストごとに作る——モジュールの外で作ると、接続を持つ DB ではリクエストをまたいで共有されてしまう。
 *
 * 上から順に const で組み立てる。依存する相手を先に書かないと、tsc が「宣言の前に使っている」で止める。
 * なので、module の依存の輪はコンパイルが通らない。
 * db そのものは返さない。inbound が書き込み先を選べてしまうので。
 * `hnk g module <名前>` が、// hnk: の行の上に足す
 */
export const makeDeps = (env: AppEnv["Bindings"]) => {
  const db = wireDb(env.DB);
  void db;
  // hnk:deps

  return {
    // hnk:returns
  };
};

export type Deps = ReturnType<typeof makeDeps>;

declare module "hnk" {
  interface Register {
    deps: Deps;
  }
}
