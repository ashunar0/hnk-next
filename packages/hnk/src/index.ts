/**
 * hnk の入口。中身は役割ごとのファイルにある。
 * - endpoint.ts + router.ts: route の宣言と handler（createRouter、reply、guard、provideDeps）
 * - failure.ts: HTTP で返す失敗（httpError、fail、onError）
 * - worker.ts: Workers の入口（createWorker）と、HTTP 以外の入口が受け取るもの
 * - page-schema.ts: 一覧のページ送りの、HTTP の入出力の形
 */
export { err, ok, type Result } from "./result.js";
export type { System } from "./system.js";
export type { Cursor, Page, PageQuery } from "./page.js";

export type { Register } from "./register.js";
export { errorResponses, guard, provideDeps, type Guard } from "./endpoint.js";
export { createRouter } from "./router.js";
export {
  Forbidden,
  NotFound,
  Unauthorized,
  type Failure,
  type FailureKind,
} from "./failures.js";
export {
  fail,
  httpError,
  onError,
  ValidationError,
  type AnyFailure,
  type HttpError,
} from "./failure.js";
export {
  allowSystem,
  createWorker,
  type CronContext,
  type QueueContext,
} from "./worker.js";
export {
  pageQuerySchema,
  pageResponse,
  pageResponseSchema,
} from "./page-schema.js";
