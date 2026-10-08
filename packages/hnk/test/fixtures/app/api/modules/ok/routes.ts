import { createEndpoint, createRouter } from "hnk";
import { requireAuth } from "../../middleware/auth";

export const okRouter = createRouter();

const endpoint = createEndpoint(
  {
    method: "get",
    path: "/",
    middleware: [requireAuth] as const,
    responses: {},
  },
  async () => {
    throw new Error("fixture");
  },
);
void endpoint;
