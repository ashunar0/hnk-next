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
