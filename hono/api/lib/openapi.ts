import {
  OpenAPIHono,
  z,
  type RouteConfig,
  type RouteConfigToEnv,
  type RouteConfigToTypedResponse,
  type RouteHandler,
} from "@hono/zod-openapi";
import type { Env, TypedResponse } from "hono";
import type { SuccessStatusCode } from "hono/utils/http-status";
import type { JSONParsed } from "hono/utils/types";
import {
  errorCatalog,
  failure,
  validationFailed,
  type DomainError,
  type ErrorCode,
  type FailureResponse,
} from "./errors";

type MaybePromise<T> = T | Promise<T>;

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

type JsonSchemaOf<R extends RouteConfig, S> = S extends keyof R["responses"]
  ? R["responses"][S] extends { content: { "application/json": { schema: infer Z extends z.ZodType } } }
    ? Z
    : never
  : never;

type JsonBodyOf<R extends RouteConfig, S> = z.infer<JsonSchemaOf<R, S>>;

/** 2xx のうち、この route が宣言したもの */
type DeclaredSuccess<R extends RouteConfig> = keyof R["responses"] & SuccessStatusCode;

/** この route が宣言した失敗のコード */
type DeclaredFailure<R extends RouteConfig> = {
  [S in keyof R["responses"]]: JsonBodyOf<R, S> extends { error: { code: infer C } } ? C : never;
}[keyof R["responses"]];

/**
 * route の responses から型を作った返し方。
 * c.json だと、ずれたときの赤線が handler の頭に付く。reply は期待する形を引数で受けるので、
 * 間違えた値そのものに赤線が付く
 */
type Reply<R extends RouteConfig> = {
  <S extends DeclaredSuccess<R>>(
    status: S,
    body: NoInfer<JsonBodyOf<R, S>>,
  ): TypedResponse<JSONParsed<JsonBodyOf<R, S>>, S, "json">;
  /**
   * ドメインの失敗。宣言していないコードを渡すと、引数に「宣言してあるのはこれ」と赤線が付く。
   * そのとき戻り値は never にして、handler の頭に同じ原因の赤線が重ならないようにする
   */
  failure<E extends DomainError>(
    error: [E] extends [DeclaredFailure<R>] ? E : DeclaredFailure<R> & DomainError,
  ): [E] extends [DeclaredFailure<R>] ? FailureResponse<E> : never;
};

/**
 * route の宣言と handler を組にする。`.openapi(...endpoint(createRoute({...}), async (c, reply) => ...))`
 * と使う。E はアプリの Env。route.ts の先頭で `const endpoint = defineEndpoint<AppEnv>();` とする
 */
export const defineEndpoint =
  <E extends Env>() =>
  <const R extends RouteConfig>(
    route: R,
    fn: (
      c: Parameters<RouteHandler<R, RouteConfigToEnv<R> & E>>[0],
      reply: Reply<R>,
    ) => MaybePromise<RouteConfigToTypedResponse<R>>,
  ) => {
    const handler: RouteHandler<R, RouteConfigToEnv<R> & E> = (c) => {
      const reply = ((status: number, body: unknown) =>
        c.json(body as never, status as never)) as unknown as Reply<R>;
      reply.failure = ((error: DomainError) => failure(c, error)) as Reply<R>["failure"];

      // R が決まっていないここでは TS が照らし合わせきれないので付け替える。使う側では fn の型で守られる
      return fn(c, reply) as never;
    };

    return [route, handler] as const;
  };
