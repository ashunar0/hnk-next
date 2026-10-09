// expect: hnk(route-declares-auth) | .endpoint に認証の指定が無い
import { createRouter } from "hnk";

export const r3Router = createRouter().endpoint(
  { method: "get", path: "/", responses: {} },
  async () => {
    throw new Error("fixture");
  },
);
