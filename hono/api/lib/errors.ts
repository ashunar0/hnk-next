import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL";

/**
 * 失敗は必ず throw する。返り値にすると RPC の推論に混ざる。
 * export しないので、feature 側は下のファクトリ経由でしか失敗を作れない
 */
class ApiError extends HTTPException {
  constructor(
    readonly code: ApiErrorCode,
    readonly httpStatus: ContentfulStatusCode,
    message: string,
  ) {
    super(httpStatus, { message });
  }
}

/**
 * 検証の失敗。validator から使う
 */
export const validationFailed = (message: string) =>
  new ApiError("VALIDATION_ERROR", 400, message);

/**
 * よく投げる失敗。コードとステータスの対応をここだけで決めるので、
 * NOT_FOUND に 400 を添えるような取り違えが書けなくなる。
 * 仕様が文言を決めているときだけ message を渡す
 */
export const unauthorized = (message = "ログインが必要です") =>
  new ApiError("UNAUTHORIZED", 401, message);

export const forbidden = (message = "この操作は許可されていません") =>
  new ApiError("FORBIDDEN", 403, message);

export const notFound = (message = "対象が見つかりません") =>
  new ApiError("NOT_FOUND", 404, message);

export const conflict = (message: string) =>
  new ApiError("CONFLICT", 409, message);

/** 素通しさせると onError が既定の文言で 500 にする。文言を決めたいときだけ */
export const internal = (message: string) =>
  new ApiError("INTERNAL", 500, message);

/** 全ての失敗の唯一の出口 */
export const onError: ErrorHandler = (err, c) => {
  if (err instanceof ApiError) {
    return c.json(
      { error: { code: err.code, message: err.message } },
      err.httpStatus,
    );
  }
  if (err instanceof HTTPException) {
    return c.json(
      { error: { code: "INTERNAL", message: err.message } },
      err.status as ContentfulStatusCode,
    );
  }
  console.error("[unhandled]", err);
  return c.json(
    { error: { code: "INTERNAL", message: "Internal Server Error" } },
    500,
  );
};
