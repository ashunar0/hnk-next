import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";
import { validationFailed } from "./errors";

const FALLBACK = "入力内容を確認してください";

/**
 * 検証に失敗したとき validator は自分で応答してしまい、
 * その応答がエンドポイントの推論型に union として混ざる。
 * throw に変えて onError へ流すことで、成功形だけが契約に残る
 */
export const validateBody = <T extends ZodType>(schema: T) =>
  zValidator("json", schema, (result) => {
    if (!result.success) {
      throw validationFailed(result.error.issues[0]?.message ?? FALLBACK);
    }
  });

export const validateQuery = <T extends ZodType>(schema: T) =>
  zValidator("query", schema, (result) => {
    if (!result.success) {
      throw validationFailed(result.error.issues[0]?.message ?? FALLBACK);
    }
  });
