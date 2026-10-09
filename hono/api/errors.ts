import { httpError } from "hnk";

/**
 * どの module でも同じ意味で使う失敗。何番で、どの文言で返すかを持つ。
 * その module だけの失敗（NOT_DRAFT など）は、module の errors.ts に置く。
 * service はこれを知らず、"NOT_FOUND" のようなコードだけを Result で返す
 */
export const Unauthorized = httpError("UNAUTHORIZED", 401, "ログインが必要です");

export const NotFound = httpError("NOT_FOUND", 404, "対象が見つかりません");

export const Forbidden = httpError("FORBIDDEN", 403, "この操作は許可されていません");
