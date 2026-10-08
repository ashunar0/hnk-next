import { scopeTo, wireDb } from "./db";
import type { AppEnv } from "./env";
import { invoicesService } from "./modules/invoices/service";
import { markPaid } from "./modules/invoices/commands/markPaid";
import { invoicesRepository, invoiceSharesTable, invoicesTable } from "./modules/invoices/repo.d1";
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
 * リクエストごとに（handler が初めて受け取るときに 1 回）呼ぶ。HTTP 以外の inbound は createWorker が呼ぶ。
 * db はリクエストごとに作る——モジュールの外で作ると、接続を持つ DB では
 * リクエストをまたいで共有されてしまう。
 *
 * 上から順に const で組み立てる。依存する相手を先に書かないと、tsc が「宣言の前に使っている」で止める。
 * なので、module の依存の輪はコンパイルが通らない（Go の main と同じ）。
 * 遅延（getter）で「使う module だけ組み立てる」ことをやめた代わりに、宣言順の保証を取った。
 * 組み立ては関数を返すだけで、env の検証も接続もしないので軽い。
 * db そのものは返さない。inbound が書き込み先を選べてしまうので
 */
export const makeDeps = (env: AppEnv["Bindings"]) => {
  const db = wireDb(env.DB);

  const invoicesRepo = invoicesRepository(
    scopeTo(db, invoicesTable),
    scopeTo(db, invoiceSharesTable),
  );
  const invoices = invoicesService(invoicesRepo);

  const payments = paymentsService(
    paymentsRepository(scopeTo(db, paymentsTable)),
    stripeGateway({
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      successUrl: `${env.APP_URL}/payments/done`,
      cancelUrl: `${env.APP_URL}/payments/canceled`,
    }),
    // payments が宣言した PayableInvoices を、読みは invoices の service、書きは commands が満たす
    { getPayable: invoices.getPayable, markPaid: markPaid(invoicesRepo) },
  );

  const reminders = remindersService(
    remindersRepository(scopeTo(db, remindersTable)),
    resendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM }),
    queuesReminderJobs(env.REMINDER_QUEUE),
    // reminders が宣言した OverdueInvoices を、invoices の service が満たす
    invoices,
  );

  // 自分のテーブルを持たず、読むだけ。書き込みの範囲（scope）ではなく、db をそのまま読みとして渡す
  const reports = reportsService(reportsRepository(db));

  return { invoices, payments, reminders, reports };
};

export type Deps = ReturnType<typeof makeDeps>;

declare module "hnk" {
  interface Register {
    deps: Deps;
  }
}
