// expect: hnk(route-declares-auth) | createEndpoint に認証の指定が無い
import { createEndpoint, createRouter } from "hnk";

export const r3Router = createRouter();

const endpoint = createEndpoint(
  { method: "get", path: "/", responses: {} },
  async () => {
    throw new Error("fixture");
  },
);
void endpoint;
