import { scopeTo, wireDb } from "./db";
import type { AppEnv } from "./env";
import { invoicesService } from "./modules/invoices/service";
import { markPaid } from "./modules/invoices/commands/markPaid";
import { invoicesRepository, invoicesTable } from "./modules/invoices/repo.d1";
import { stripeGateway } from "./modules/payments/gateway.stripe";
import { paymentsRepository, paymentsTable } from "./modules/payments/repo.d1";
import { paymentsService } from "./modules/payments/service";
import { queuesReminderJobs } from "./modules/reminders/jobs.queues";
import { resendMailer } from "./modules/reminders/mailer.resend";
import { remindersRepository, remindersTable } from "./modules/reminders/repo.d1";
import { remindersService } from "./modules/reminders/service";
import { reportsRepository } from "./modules/reports/repo.d1";
import { reportsService } from "./modules/reports/service";

/**
 * module の組み立て方を集める唯一の場所（composition root）。
 *
 * 組み立てた結果ではなく、組み立て方を buildApp に渡す。hnk の provideDeps が
 * リクエストごとに呼び、handler は第 3 引数で受け取る。HTTP 以外の inbound（cron、キュー）は index.ts で呼ぶ。
 * db はリクエストごとに作る——モジュールの外で作ると、接続を持つ DB では
 * リクエストをまたいで共有されてしまう。getter なので、読んだ module だけが組み上がる。
 * getter は互いを呼ぶので、module の依存は一方向に保つ（逆向きが入ると無限再帰。test/deps.test.ts が止める）。
 * db そのものは返さない。inbound が書き込み先を選べてしまうので
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
        // payments が宣言した PayableInvoices を、読みは invoices の service、書きは commands が満たす
        {
          getPayable: this.invoices.getPayable,
          markPaid: markPaid(invoicesRepository(scopeTo(db, invoicesTable))),
        },
      );
    },
    get reminders() {
      return remindersService(
        remindersRepository(scopeTo(db, remindersTable)),
        resendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM }),
        queuesReminderJobs(env.REMINDER_QUEUE),
        // reminders が宣言した OverdueInvoices を、invoices の service が満たす
        this.invoices,
      );
    },
    // 自分のテーブルを持たず、読むだけ。書き込みの範囲（scope）ではなく、db をそのまま読みとして渡す
    get reports() {
      return reportsService(reportsRepository(db));
    },
  };
};

export type Deps = ReturnType<typeof makeDeps>;

declare module "hnk" {
  interface Register {
    deps: Deps;
  }
}
