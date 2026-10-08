import { createRoute, createRouter } from "hnk";
import { requireAuth } from "../../middleware/auth";

export const okRouter = createRouter();

const route = createRoute({
  method: "get",
  path: "/",
  middleware: [requireAuth] as const,
  responses: {},
});
void route;
