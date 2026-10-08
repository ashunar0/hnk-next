import type { Context, ErrorHandler, TypedResponse } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "INTERNAL";

/**
 * HTTP の入口で起きる失敗（未ログイン、入力の形が違う）。throw して onError へ流す。
 * ドメインの失敗はこれを使わず、Result で返す（DomainError）。
 * export しないので、下のファクトリ経由でしか作れない
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

/** ログインしていない。requireAuth から使う */
export const unauthorized = (message = "ログインが必要です") =>
  new ApiError("UNAUTHORIZED", 401, message);

/**
 * ドメインの失敗。service は HTTP を知らず、この名前を Result で返す
 */
export type DomainError = "NOT_FOUND" | "NOT_OWNER";

/**
 * ドメインの失敗を何番で、どの文言で返すか。ここだけで決める。
 * DomainError に名前を足して、ここに足し忘れると型エラーになる
 */
const domainErrors = {
  NOT_FOUND: { status: 404, message: "対象が見つかりません" },
  NOT_OWNER: { status: 403, message: "この操作は許可されていません" },
} as const satisfies Record<DomainError, { status: ContentfulStatusCode; message: string }>;

/**
 * ドメインの失敗を応答にする。route で `if (!result.ok) return failure(c, result.error);` と使う。
 * ステータスがリテラルのまま残るので、クライアントの型にも何番が返りうるかが出る
 */
export const failure = <E extends DomainError>(c: Context, error: E) =>
  c.json(
    { error: { code: error, message: domainErrors[error].message } },
    domainErrors[error].status,
  ) as unknown as FailureResponse<E>;

/** 失敗の種類ごとに応答を分ける。404 なら NOT_FOUND、と型の上でも対応が残る */
type FailureResponse<E extends DomainError> = {
  [K in E]: TypedResponse<
    { error: { code: K; message: string } },
    (typeof domainErrors)[K]["status"],
    "json"
  >;
}[E];

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
