/**
 * 失敗のデータ。HTTP の番号は知らないので、core（service、commands）からも import してよい。
 * どの module でも同じ意味で使う 3 つ（401・403・404）は、ここが標準として持つ。
 * その module だけの失敗は、module の domain.ts に Failure として置く
 */

/** 失敗の種類。HTTP の番号への対応は failure.ts が 1 か所で持つ */
export type FailureKind =
  "unauthenticated" | "forbidden" | "notFound" | "conflict" | "upstream";

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
