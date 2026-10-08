import { createHnk } from "hnk";
import type { AppEnv } from "./env";
import { errorCatalog } from "./errors";

/**
 * hnk をこのアプリに結びつける唯一の場所。feature は hnk をここからだけ import する
 */

declare module "hnk" {
  interface Register {
    env: AppEnv;
  }
}

export const { createRouter, createEndpoint, errorResponses, fail, onError } = createHnk({
  errors: errorCatalog,
  validationError: "VALIDATION_ERROR",
});

export { createRoute, err, json, jsonBody, ok, type Result } from "hnk";
