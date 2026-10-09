/**
 * hnk の入口。中身は役割ごとのファイルにある。
 * - endpoint.ts: route の宣言と handler（createRouter、createEndpoint、reply、guard、provideDeps）
 * - failure.ts: HTTP で返す失敗（httpError、fail、onError）
 * - worker.ts: Workers の入口（createWorker）と、HTTP 以外の入口が受け取るもの
 * - page-schema.ts: 一覧のページ送りの、HTTP の入出力の形
 */
export { err, ok, type Result } from "./result";
export type { System } from "./system";
export type { Cursor, Page, PageQuery } from "./page";

export type { Register } from "./register";
export {
  createEndpoint,
  createRouter,
  errorResponses,
  guard,
  json,
  jsonBody,
  provideDeps,
  type Guard,
} from "./endpoint";
export {
  fail,
  httpError,
  onError,
  ValidationError,
  type HttpError,
} from "./failure";
export {
  allowSystem,
  createWorker,
  type CronContext,
  type QueueContext,
} from "./worker";
export {
  cursorSchema,
  encodeCursor,
  pageQuery,
  pageResponse,
  pageResponseSchema,
} from "./page-schema";
