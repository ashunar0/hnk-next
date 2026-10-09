import type { MiddlewareHandler } from "hono";
import { createRouter, createWorker, onError, provideDeps } from "hnk";
import { openapiDocument } from "hnk/openapi";
import { makeDeps, type Deps } from "./deps";
import type { AppEnv } from "./env";
import { withUser } from "./middleware/auth";
// hnk:imports

/**
 * アプリを組み立てる。依存の組み立て方と、ログイン状態の決め方を外から受け取るので、
 * 本番は makeDeps と withUser を、テストは偽物を渡す。
 * authenticate はセッションの user（ログインしていなければ null）を文脈に積む middleware。認証の提供元を差し込む場所
 */
export const buildApp = (
  makeDeps: (env: AppEnv["Bindings"]) => Deps,
  authenticate: MiddlewareHandler<AppEnv> = withUser,
) => {
  const app = createRouter()
    .use("*", provideDeps(makeDeps))
    .use("*", authenticate)
    // hnk:routes
    .onError(onError);

  // 登録された route の宣言から作る。リクエストのたびに読むので、登録の順番に関係しない
  app.get("/openapi.json", (c) =>
    c.json(openapiDocument(app, { title: "__APP_NAME__", version: "0.0.0" })),
  );

  return app;
};

export type ApiApp = ReturnType<typeof buildApp>;

const app = buildApp(makeDeps);

/**
 * Workers の入口。HTTP は app に渡す。
 * cron やキューを足すときは、scheduled / queue をここに渡す。依存の組み立て、actor（システム）、now、
 * ack と retry は createWorker が受け持つ
 */
export default createWorker({ makeDeps, fetch: app.fetch });
