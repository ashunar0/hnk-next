// expect: hnk(route-exports-only-the-router) | routes.ts が createRouter() の束以外を export している
import { createRouter } from "hnk";

export const r1Router = createRouter();
export const helper = 1;
