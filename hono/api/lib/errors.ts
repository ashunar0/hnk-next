import type { Context, ErrorHandler, TypedResponse } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * 失敗の一覧。何番で、どの文言で返すかをここだけで決める。
 * route の responses（errorResponses）も、実際の応答（failure、onError）も、この表から作る
 */
export const errorCatalog = {
  // HTTP の入口で起きる失敗。middleware や validator が throw する
  VALIDATION_ERROR: { status: 400, message: "入力内容を確認してください" },
  UNAUTHORIZED: { status: 401, message: "ログインが必要です" },
  // ドメインの失敗。service が Result で返す
  NOT_FOUND: { status: 404, message: "対象が見つかりません" },
  NOT_OWNER: { status: 403, message: "この操作は許可されていません" },
} as const satisfies Record<string, { status: ContentfulStatusCode; message: string }>;

export type ErrorCode = keyof typeof errorCatalog;

/** service が Result で返してよい失敗 */
export type DomainError = Extract<ErrorCode, "NOT_FOUND" | "NOT_OWNER">;

/**
 * HTTP の入口で起きる失敗。throw して onError へ流す。
 * export しないので、下のファクトリ経由でしか作れない
 */
class ApiError extends HTTPException {
  constructor(
    readonly code: Exclude<ErrorCode, DomainError>,
    message: string = errorCatalog[code].message,
  ) {
    super(errorCatalog[code].status, { message });
  }
}

/** 検証の失敗。validator から使う */
export const validationFailed = (message?: string) => new ApiError("VALIDATION_ERROR", message);

/** ログインしていない。requireAuth から使う */
export const unauthorized = () => new ApiError("UNAUTHORIZED");

/**
 * ドメインの失敗を応答にする。route で `if (!result.ok) return failure(c, result.error);` と使う
 */
export const failure = <E extends DomainError>(c: Context, error: E) =>
  c.json(
    { error: { code: error, message: errorCatalog[error].message } },
    errorCatalog[error].status,
  ) as unknown as FailureResponse<E>;

/**
 * 失敗の種類ごとに応答を分ける。c.json のままだと 404 と 403 が 1 つにまとまり、
 * 「404 なら NOT_FOUND」の対応が型から消える
 */
export type FailureResponse<E extends DomainError> = {
  [K in E]: TypedResponse<
    { error: { code: K; message: string } },
    (typeof errorCatalog)[K]["status"],
    "json"
  >;
}[E];

/** 全ての失敗の唯一の出口 */
export const onError: ErrorHandler = (err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status as ContentfulStatusCode);
  }
  if (err instanceof HTTPException) {
    return c.json(
      { error: { code: "INTERNAL", message: err.message } },
      err.status as ContentfulStatusCode,
    );
  }
  console.error("[unhandled]", err);
  return c.json({ error: { code: "INTERNAL", message: "Internal Server Error" } }, 500);
};
