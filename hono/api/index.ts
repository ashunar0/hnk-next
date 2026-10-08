import { createRouter, onError, provideDeps } from "hnk";
import { makeDeps, type Deps } from "./deps";
import type { AppEnv } from "./env";
import { invoicesRouter } from "./modules/invoices/routes";
import { paymentsRouter } from "./modules/payments/routes";
import { reportsRouter } from "./modules/reports/routes";
import { stripeWebhookRouter } from "./modules/payments/webhook.stripe";
import { withViewer } from "./middleware/auth";
import { enqueueOverdueReminders } from "./modules/reminders/cron";
import type { ReminderJob } from "./modules/reminders/domain";
import { sendReminders } from "./modules/reminders/queue";

/**
 * アプリを組み立てる。依存の組み立て方を外から受け取るので、
 * 本番は makeDeps を、テストは偽物を返す関数を渡す
 */
export const buildApp = (makeDeps: (env: AppEnv["Bindings"]) => Deps) => {
  const root = createRouter();

  // .use などのチェーンは OpenAPIHono ではなく Hono を返すので、doc は先に呼ぶ
  root.doc("/openapi.json", {
    openapi: "3.1.0",
    info: { title: "invoices", version: "0.0.0" },
  });

  return root
    .use("*", provideDeps(makeDeps))
    .use("*", withViewer)
    .route("/invoices", invoicesRouter)
    .route("/payments", paymentsRouter)
    .route("/reports", reportsRouter)
    .route("/webhooks/stripe", stripeWebhookRouter)
    .onError(onError);
};

export type ApiApp = ReturnType<typeof buildApp>;

const app = buildApp(makeDeps);

/**
 * Workers の入口。HTTP は app、時刻は cron、キューは queue に渡す。
 * HTTP 以外の入口は provideDeps を通らないので、ここで makeDeps を呼んで渡す
 */
export default {
  fetch: app.fetch,
  async scheduled(controller, env) {
    await enqueueOverdueReminders(makeDeps(env), new Date(controller.scheduledTime));
  },
  async queue(batch, env) {
    await sendReminders(makeDeps(env), batch as MessageBatch<ReminderJob>);
  },
} satisfies ExportedHandler<Env, ReminderJob>;
