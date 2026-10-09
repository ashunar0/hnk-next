import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** HTTP で返す失敗 1 つ。コード、何番か、既定の文言を持つ */
export type HttpError<
  K extends string = string,
  S extends ContentfulStatusCode = ContentfulStatusCode,
> = {
  readonly code: K;
  readonly status: S;
  readonly message: string;
};

/**
 * 失敗の種類と、HTTP で返す番号の対応。ここ 1 か所だけが持つ（Go の errors.go、gRPC のステータスコードと同じ考え方）。
 * 種類を足すのは、既存のどれでも言い表せない失敗が現れたとき
 */
const FAILURE_STATUS = {
  unauthenticated: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  upstream: 502,
} as const;

export type FailureKind = keyof typeof FAILURE_STATUS;

/**
 * モノの側（domain）が持つ失敗。コード、種類、既定の文言。HTTP の番号は知らない。
 * `export const NotDraft = { code: "NOT_DRAFT", kind: "conflict", message: "…" } as const;`
 */
export type Failure<
  K extends string = string,
  Kind extends FailureKind = FailureKind,
> = {
  readonly code: K;
  readonly kind: Kind;
  readonly message: string;
};

/** errorResponses が受け取れる失敗。Failure は種類から番号が決まり、HttpError は番号を自分で持つ */
export type AnyFailure = Failure | HttpError;

/** Failure なら種類から番号を決めた HttpError にする。HttpError はそのまま */
export type ToHttpError<F extends AnyFailure> =
  F extends Failure<infer K, infer Kind>
    ? HttpError<K, (typeof FAILURE_STATUS)[Kind]>
    : F;

export const toHttpError = <const F extends AnyFailure>(
  failure: F,
): ToHttpError<F> =>
  ("status" in failure
    ? failure
    : httpError(
        failure.code,
        FAILURE_STATUS[failure.kind],
        failure.message,
      )) as ToHttpError<F>;

/** `export const NotFound = httpError("NOT_FOUND", 404, "対象が見つかりません");` */
export const httpError = <
  const K extends string,
  const S extends ContentfulStatusCode,
>(
  code: K,
  status: S,
  message: string,
): HttpError<K, S> => ({ code, status, message });

/** 入力の検査に失敗したとき。createRouter が使う */
export const ValidationError = httpError(
  "VALIDATION_ERROR",
  400,
  "Invalid request",
);

class HnkError extends HTTPException {
  constructor(
    readonly code: string,
    status: ContentfulStatusCode,
    message: string,
  ) {
    super(status, { message });
  }
}

/** HTTP の入口で起きる失敗を作る。middleware など、handler の外で `throw fail(Unauthorized)` */
export const fail = (error: HttpError, message = error.message) =>
  new HnkError(error.code, error.status, message);

export const errorBody = (code: string, message: string) => ({
  error: { code, message },
});

/** 全ての失敗の唯一の出口。`app.onError(onError)` */
export const onError: ErrorHandler = (error, c) => {
  if (error instanceof HnkError) {
    return c.json(
      errorBody(error.code, error.message),
      error.status as ContentfulStatusCode,
    );
  }
  if (error instanceof HTTPException) {
    return c.json(
      errorBody("INTERNAL", error.message),
      error.status as ContentfulStatusCode,
    );
  }
  console.error("[unhandled]", error);
  return c.json(errorBody("INTERNAL", "Internal Server Error"), 500);
};
