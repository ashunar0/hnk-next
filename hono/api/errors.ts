/**
 * どの module でも同じ意味で使う失敗。コード、種類、既定の文言を持ち、番号は種類から hnk が決める。
 * その module だけの失敗（NOT_DRAFT など）は、module の domain.ts に置く。
 * service はこれを知らず、"NOT_FOUND" のようなコードだけを Result で返す
 */
export const Unauthorized = {
  code: "UNAUTHORIZED",
  kind: "unauthenticated",
  message: "ログインが必要です",
} as const;

export const NotFound = {
  code: "NOT_FOUND",
  kind: "notFound",
  message: "対象が見つかりません",
} as const;

export const Forbidden = {
  code: "FORBIDDEN",
  kind: "forbidden",
  message: "この操作は許可されていません",
} as const;
