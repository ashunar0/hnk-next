import { Hono } from "hono";
import type { AppEnv } from "./env";
import { invoicesRoute } from "./features/invoices/route";
import { onError } from "./lib/errors";
import { withViewer } from "./middleware/auth";

const app = new Hono<AppEnv>()
  .use("*", withViewer)
  .route("/invoices", invoicesRoute)
  .onError(onError);

export type ApiApp = typeof app;
export default app;
