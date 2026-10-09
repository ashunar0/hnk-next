/**
 * 本物のプロジェクトでは `pnpm wrangler types` が生成できる。
 * 束縛（D1、キュー、secret など）を wrangler.jsonc に足したら、ここにも足す
 */
declare global {
  // cloudflare:workers の env は Cloudflare.Env 型なので、このアプリの Env とつなぐ
  namespace Cloudflare {
    interface Env extends globalThis.Env {}
  }

  interface Env {
    DB: D1Database;
  }
}

export {};
