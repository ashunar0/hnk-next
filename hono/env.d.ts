/**
 * 本物のプロジェクトでは `wrangler types` が生成する。
 * fixture は型検査しかしないので、生成物が触る束縛だけを手で書いてある
 */
declare global {
  interface Env {
    DB: D1Database;
  }
}

export {};
