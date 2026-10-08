import {
  createRoute,
  OpenAPIHono,
  z,
  type RouteConfig,
  type RouteConfigToEnv,
  type RouteConfigToTypedResponse,
  type RouteHandler,
} from "@hono/zod-openapi";
import type { Context, Env, ErrorHandler, TypedResponse } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode, SuccessStatusCode } from "hono/utils/http-status";
import type { JSONParsed } from "hono/utils/types";

export { createRoute };
export { err, ok, type Result } from "./result";

/**
 * アプリが型を登録する場所。アプリ側で 1 回だけ
 * `declare module "hnk" { interface Register { env: AppEnv } }` と書く
 */
export interface Register {}

type RegisteredEnv = Register extends { env: infer E extends Env } ? E : Env;

/** 失敗の一覧の形。コードごとに、何番で、どの文言で返すか */
export type ErrorCatalog = Record<string, { status: ContentfulStatusCode; message: string }>;

type MaybePromise<T> = T | Promise<T>;

// ---- responses の宣言 ----

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

const errorSchema = <K extends string>(code: K) =>
  z.object({ error: z.object({ code: z.literal(code), message: z.string() }) });

type ErrorResponses<C extends ErrorCatalog, K extends keyof C & string> = {
  [P in K as C[P]["status"]]: {
    description: string;
    content: { "application/json": { schema: ReturnType<typeof errorSchema<P>> } };
  };
};

// ---- reply の型 ----

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
  [S in keyof R["responses"]]: JsonBodyOf<R, S> extends { error: { code: infer K } } ? K : never;
}[keyof R["responses"]];

/**
 * 失敗の種類ごとに応答を分ける。c.json のままだと 404 と 403 が 1 つにまとまり、
 * 「404 なら NOT_FOUND」の対応が型から消える
 */
type FailureResponse<C extends ErrorCatalog, K extends keyof C> = {
  [P in K]: TypedResponse<{ error: { code: P; message: string } }, C[P]["status"], "json">;
}[K];

/**
 * route の responses から型を作った返し方。
 * c.json だと、ずれたときの赤線が handler の頭に付く。reply は期待する形を引数で受けるので、
 * 間違えた値そのものに赤線が付く
 */
type Reply<C extends ErrorCatalog, R extends RouteConfig> = {
  <S extends DeclaredSuccess<R>>(
    status: S,
    body: NoInfer<JsonBodyOf<R, S>>,
  ): TypedResponse<JSONParsed<JsonBodyOf<R, S>>, S, "json">;
  /**
   * 想定内の失敗。宣言していないコードを渡すと、引数に「宣言してあるのはこれ」と赤線が付く。
   * そのとき戻り値は never にして、handler の頭に同じ原因の赤線が重ならないようにする
   */
  failure<K extends keyof C & string>(
    error: [K] extends [DeclaredFailure<R>] ? K : DeclaredFailure<R> & keyof C,
  ): [K] extends [DeclaredFailure<R>] ? FailureResponse<C, K> : never;
};

// ---- アプリへの結びつけ ----

/**
 * アプリのエラーの表を受け取り、それに結びついた道具一式を返す。アプリに 1 回だけ呼ぶ。
 * validationError は、入力の検査に失敗したときに使うコード
 */
export function createHnk<const C extends ErrorCatalog>(options: {
  errors: C;
  validationError: keyof C & string;
}) {
  type Code = keyof C & string;
  const { errors } = options;

  /** throw して onError へ流す失敗。middleware など、handler の外で使う */
  class HnkError extends HTTPException {
    constructor(
      readonly code: Code,
      message: string = errors[code]!.message,
    ) {
      super(errors[code]!.status, { message });
    }
  }

  const errorBody = (code: string, message: string) => ({ error: { code, message } });

  return {
    /** HTTP の入口で起きる失敗を作る。`throw fail("UNAUTHORIZED")` */
    fail: (code: Code, message?: string) => new HnkError(code, message),

    /** route をまとめる Hono。検証に失敗したら throw して onError へ流す */
    createRouter: () =>
      new OpenAPIHono<RegisteredEnv>({
        defaultHook: (result) => {
          if (!result.success) {
            throw new HnkError(options.validationError, result.error.issues[0]?.message);
          }
        },
      }),

    /**
     * responses の失敗の部分。ステータスはエラーの表から引くので、手では書かない。
     * `responses: { 200: json(...), ...errorResponses("UNAUTHORIZED", "NOT_FOUND") }`
     */
    errorResponses: <const K extends Code>(...codes: K[]) =>
      Object.fromEntries(
        codes.map((code) => [errors[code]!.status, json(errorSchema(code), errors[code]!.message)]),
      ) as ErrorResponses<C, K>,

    /**
     * route の宣言と handler を組にする。
     * `.openapi(...createEndpoint(createRoute({...}), async (c, reply) => ...))`
     */
    createEndpoint: <const R extends RouteConfig>(
      route: R,
      fn: (
        c: Parameters<RouteHandler<R, RouteConfigToEnv<R> & RegisteredEnv>>[0],
        reply: Reply<C, R>,
      ) => MaybePromise<RouteConfigToTypedResponse<R>>,
    ) => {
      const handler: RouteHandler<R, RouteConfigToEnv<R> & RegisteredEnv> = (c) => {
        const reply = ((status: number, body: unknown) =>
          c.json(body as never, status as never)) as unknown as Reply<C, R>;
        reply.failure = ((code: Code) =>
          c.json(errorBody(code, errors[code]!.message), errors[code]!.status)) as Reply<C, R>["failure"];

        // R が決まっていないここでは TS が照らし合わせきれないので付け替える。使う側では fn の型で守られる
        return fn(c, reply) as never;
      };

      return [route, handler] as const;
    },

    /** 全ての失敗の唯一の出口 */
    onError: ((error, c: Context) => {
      if (error instanceof HnkError) {
        return c.json(errorBody(error.code, error.message), error.status as ContentfulStatusCode);
      }
      if (error instanceof HTTPException) {
        return c.json(errorBody("INTERNAL", error.message), error.status as ContentfulStatusCode);
      }
      console.error("[unhandled]", error);
      return c.json(errorBody("INTERNAL", "Internal Server Error"), 500);
    }) satisfies ErrorHandler,
  };
}
