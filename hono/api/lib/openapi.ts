import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { Env } from "hono";
import { errorCatalog, validationFailed, type ErrorCode } from "./errors";

/**
 * route をまとめる Hono。検証に失敗したら throw して onError へ流す
 * （validator が自分で応答すると、宣言していない形の 400 が返ってしまう）
 */
export const createRouter = <E extends Env>() =>
  new OpenAPIHono<E>({
    defaultHook: (result) => {
      if (!result.success) throw validationFailed(result.error.issues[0]?.message);
    },
  });

/**
 * JSON の本文。required を必ず付ける——付けないと、Content-Type の無いリクエストで
 * 検査そのものが飛ばされる
 */
export const jsonBody = <T extends z.ZodType>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
});

/** JSON の応答 1 つ */
export const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

const errorSchema = <C extends ErrorCode>(code: C) =>
  z.object({ error: z.object({ code: z.literal(code), message: z.string() }) });

/**
 * responses の失敗の部分。ステータスは errorCatalog から引くので、手では書かない。
 * `responses: { 200: json(...), ...errorResponses("UNAUTHORIZED", "NOT_FOUND") }`
 */
export const errorResponses = <const C extends ErrorCode>(...codes: C[]) =>
  Object.fromEntries(
    codes.map((code) => [errorCatalog[code].status, json(errorSchema(code), errorCatalog[code].message)]),
  ) as {
    [K in C as (typeof errorCatalog)[K]["status"]]: {
      description: string;
      content: { "application/json": { schema: ReturnType<typeof errorSchema<K>> } };
    };
  };
