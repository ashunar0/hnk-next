import { scopeTo, wireDb } from "./db";
import type { AppEnv } from "./env";
import { invoicesService } from "./modules/invoices/domain";
import { invoicesRepository, invoicesTable } from "./modules/invoices/repo.d1";

/**
 * feature の組み立て方を集める唯一の場所（composition root）。
 *
 * 組み立てた結果ではなく、組み立て方を buildApp に渡す。hnk の provideDeps が
 * リクエストごとに呼び、handler は第 3 引数で受け取る。
 * 組み立ての入れ子は `hnk g feature` が 1 つずつ足すので、手では書かない。
 * db はリクエストごとに作る——モジュールの外で作ると、接続を持つ DB では
 * リクエストをまたいで共有されてしまう。getter なので、読んだ feature だけが組み上がる。
 * db そのものは返さない。route が書き込み先を選べてしまうので
 */
export const makeDeps = (env: AppEnv["Bindings"]) => {
  const db = wireDb(env.DB);

  return {
    get invoices() {
      return invoicesService(invoicesRepository(scopeTo(db, invoicesTable)));
    },
  };
};

export type Deps = ReturnType<typeof makeDeps>;

declare module "hnk" {
  interface Register {
    deps: Deps;
  }
}
