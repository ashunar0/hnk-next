import { createRouter, onError, provideDeps } from "hnk";
import { makeDeps, type Deps } from "./deps";
import type { AppEnv } from "./env";
import { invoicesRouter } from "./features/invoices/route";
import { withViewer } from "./middleware/auth";

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
    .onError(onError);
};

export type ApiApp = ReturnType<typeof buildApp>;
export default buildApp(makeDeps);
