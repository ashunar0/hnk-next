/**
 * 本物のプロジェクトでは `wrangler types` が生成する。
 * fixture は型検査しかしないので、生成物が触る束縛だけを手で書いてある
 */
declare global {
  interface Env {
    DB: D1Database;
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    /** 支払い画面から戻ってくる先 */
    APP_URL: string;
  }
}

export {};
