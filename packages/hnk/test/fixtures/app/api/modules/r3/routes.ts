// expect: hnk(route-declares-auth) | .endpoint に認証の指定が無い
import { createRouter } from "hono-kit";

export const r3Router = createRouter().endpoint(
  { method: "post", path: "/", responses: {} },
  async () => {
    throw new Error("fixture");
  },
);
