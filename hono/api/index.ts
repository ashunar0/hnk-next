import { invoicesRouter } from "./features/invoices/route";
import { createRouter, onError } from "./hnk";
import { withViewer } from "./middleware/auth";

const root = createRouter();

// .use などのチェーンは OpenAPIHono ではなく Hono を返すので、doc は先に呼ぶ
root.doc("/openapi.json", {
  openapi: "3.1.0",
  info: { title: "invoices", version: "0.0.0" },
});

const app = root.use("*", withViewer).route("/invoices", invoicesRouter).onError(onError);

export type ApiApp = typeof app;
export default app;
