import { scopeTo, wireDb } from "./db";
import type { AppEnv } from "./env";
import { invoices as invoicesTable } from "./features/invoices/table";
import { invoicesRepository } from "./features/invoices/repository";
import { invoicesService } from "./features/invoices/service";

/**
 * 実験中: feature の組み立てを集める唯一の場所（composition root）。
 *
 * handler は `const { invoices } = deps(c);` の 1 行で service を受け取る。
 * 組み立ての入れ子は `hnk g feature` が 1 つずつ足すので、手では書かない。
 * db はリクエストごとに作る——モジュールの外で作ると、接続を持つ DB では
 * リクエストをまたいで共有されてしまう。getter なので、読んだ feature だけが組み上がる。
 * db そのものは返さない。route が書き込み先を選べてしまうので。
 * 引数が Context でなく env だけなのは、guard を通って Variables が絞られた c も
 * そのまま渡せるようにするため（Context はその違いを受け付けない）
 */
export const deps = (c: { env: AppEnv["Bindings"] }) => {
  const db = wireDb(c.env.DB);

  return {
    get invoices() {
      return invoicesService(invoicesRepository(scopeTo(db, invoicesTable)));
    },
  };
};
