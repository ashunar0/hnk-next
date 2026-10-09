import { createRouter } from "hnk";
import { requireAuth } from "../../middleware/auth";

export const okRouter = createRouter().endpoint(
  {
    method: "post",
    path: "/",
    middleware: [requireAuth] as const,
    responses: {},
  },
  async () => {
    throw new Error("fixture");
  },
);
