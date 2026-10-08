import { httpError } from "hnk";

/**
 * このアプリの失敗。何番で、どの文言で返すかを持つ。
 * service はこれを知らず、"NOT_FOUND" のようなコードだけを Result で返す
 */
export const Unauthorized = httpError("UNAUTHORIZED", 401, "ログインが必要です");

export const NotFound = httpError("NOT_FOUND", 404, "対象が見つかりません");
