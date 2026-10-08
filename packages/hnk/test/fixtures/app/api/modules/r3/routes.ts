// expect: hnk(route-declares-auth) | createRoute に認証の指定が無い
import { createRoute, createRouter } from "hnk";

export const r3Router = createRouter();

const route = createRoute({ method: "get", path: "/", responses: {} });
void route;
