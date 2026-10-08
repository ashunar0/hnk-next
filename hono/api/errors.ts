/**
 * このアプリの失敗の一覧。何番で、どの文言で返すかをここだけで決める
 */
export const errorCatalog = {
  // HTTP の入口で起きる失敗。middleware や入力の検査が throw する
  VALIDATION_ERROR: { status: 400, message: "入力内容を確認してください" },
  UNAUTHORIZED: { status: 401, message: "ログインが必要です" },
  // ドメインの失敗。service が Result で返す
  NOT_FOUND: { status: 404, message: "対象が見つかりません" },
  NOT_OWNER: { status: 403, message: "この操作は許可されていません" },
} as const;

/** service が Result で返してよい失敗 */
export type DomainError = "NOT_FOUND" | "NOT_OWNER";
