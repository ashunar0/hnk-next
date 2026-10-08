import { scopeTo, wireDb } from "./db";
import type { AppEnv } from "./env";
import { invoicesService } from "./modules/invoices/service";
import { invoicesRepository, invoicesTable } from "./modules/invoices/repo.d1";
import { stripeGateway } from "./modules/payments/gateway.stripe";
import { paymentsRepository, paymentsTable } from "./modules/payments/repo.d1";
import { paymentsService } from "./modules/payments/service";
import { settlePayment } from "./usecases/settle-payment";

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
    get payments() {
      return paymentsService(
        paymentsRepository(scopeTo(db, paymentsTable)),
        stripeGateway({
          secretKey: env.STRIPE_SECRET_KEY,
          webhookSecret: env.STRIPE_WEBHOOK_SECRET,
          successUrl: `${env.APP_URL}/payments/done`,
          cancelUrl: `${env.APP_URL}/payments/canceled`,
        }),
        // payments が宣言した PayableInvoices を、invoices の service が満たす
        this.invoices,
      );
    },
    // 2 つの module に書く操作。それぞれの service が、usecase の宣言した形を満たす
    get settlePayment() {
      return settlePayment(this.payments, this.invoices);
    },
  };
};

export type Deps = ReturnType<typeof makeDeps>;

declare module "hnk" {
  interface Register {
    deps: Deps;
  }
}
