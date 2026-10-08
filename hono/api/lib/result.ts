/**
 * 想定内の失敗を戻り値で返すための型。
 *
 * value を取り出すには先に ok で絞る必要があるので、失敗の処理を飛ばせない。
 * どの失敗がありうるかは E に列挙する。想定外の失敗（DB が落ちた等）は throw のままにする
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T) => ({ ok: true, value }) as const;

export const err = <E>(error: E) => ({ ok: false, error }) as const;
