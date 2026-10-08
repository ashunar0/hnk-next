/**
 * 本物のプロジェクトでは `wrangler types` が生成する。
 * fixture は型検査しかしないので、生成物が触る束縛だけを手で書いてある
 */
declare global {
  interface Env {
    DB: D1Database;
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    RESEND_API_KEY: string;
    MAIL_FROM: string;
    REMINDER_QUEUE: Queue<import("./api/modules/reminders/domain").ReminderJob>;
    /** 支払い画面から戻ってくる先 */
    APP_URL: string;
  }
}

export {};
