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
 * アプリが型を登録する場所。AppEnv を定義するファイルで 1 回だけ
 * `declare module "hnk" { interface Register { env: AppEnv } }` と書く
 */
export interface Register {}

type RegisteredEnv = Register extends { env: infer E extends Env } ? E : Env;

type MaybePromise<T> = T | Promise<T>;

// ---- 失敗 ----

/** HTTP で返す失敗 1 つ。コード、何番か、既定の文言を持つ */
export type HttpError<K extends string = string, S extends ContentfulStatusCode = ContentfulStatusCode> = {
  readonly code: K;
  readonly status: S;
  readonly message: string;
};

/** `export const NotFound = httpError("NOT_FOUND", 404, "対象が見つかりません");` */
export const httpError = <const K extends string, const S extends ContentfulStatusCode>(
  code: K,
  status: S,
  message: string,
): HttpError<K, S> => ({ code, status, message });

/** 入力の検査に失敗したとき。createRouter が使う */
export const ValidationError = httpError("VALIDATION_ERROR", 400, "Invalid request");

class HnkError extends HTTPException {
  constructor(
    readonly code: string,
    status: ContentfulStatusCode,
    message: string,
  ) {
    super(status, { message });
  }
}

/** HTTP の入口で起きる失敗を作る。middleware など、handler の外で `throw fail(Unauthorized)` */
export const fail = (error: HttpError, message = error.message) =>
  new HnkError(error.code, error.status, message);

const errorBody = (code: string, message: string) => ({ error: { code, message } });

/** 全ての失敗の唯一の出口。`app.onError(onError)` */
export const onError: ErrorHandler = (error, c) => {
  if (error instanceof HnkError) {
    return c.json(errorBody(error.code, error.message), error.status as ContentfulStatusCode);
  }
  if (error instanceof HTTPException) {
    return c.json(errorBody("INTERNAL", error.message), error.status as ContentfulStatusCode);
  }
  console.error("[unhandled]", error);
  return c.json(errorBody("INTERNAL", "Internal Server Error"), 500);
};

// ---- router ----

/** route をまとめる Hono。`new Hono()` の代わり。検証に失敗したら throw して onError へ流す */
export const createRouter = () =>
  new OpenAPIHono<RegisteredEnv>({
    defaultHook: (result) => {
      if (!result.success) throw fail(ValidationError, result.error.issues[0]?.message);
    },
  });

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

/**
 * responses の失敗の部分。ステータスは失敗が持っているので、手では書かない。
 * `responses: { 200: json(...), ...errorResponses(Unauthorized, NotFound) }`
 */
export const errorResponses = <const T extends readonly HttpError[]>(...errors: T) =>
  Object.fromEntries(errors.map((e) => [e.status, json(errorSchema(e.code), e.message)])) as {
    [E in T[number] as E["status"]]: {
      description: string;
      content: { "application/json": { schema: ReturnType<typeof errorSchema<E["code"]>> } };
    };
  };

// ---- reply ----

type JsonSchemaOf<R extends RouteConfig, S> = S extends keyof R["responses"]
  ? R["responses"][S] extends { content: { "application/json": { schema: infer Z extends z.ZodType } } }
    ? Z
    : never
  : never;

type JsonBodyOf<R extends RouteConfig, S> = z.infer<JsonSchemaOf<R, S>>;

type CodeOf<R extends RouteConfig, S> = JsonBodyOf<R, S> extends { error: { code: infer K } } ? K : never;

/** 2xx のうち、この route が宣言したもの */
type DeclaredSuccess<R extends RouteConfig> = keyof R["responses"] & SuccessStatusCode;

/** この route が宣言した失敗のコード */
type DeclaredFailure<R extends RouteConfig> = { [S in keyof R["responses"]]: CodeOf<R, S> }[keyof R["responses"]];

/** 失敗のコードごとに、宣言したステータスの応答を返す。「404 なら NOT_FOUND」の対応を型に残す */
type FailureResponse<R extends RouteConfig, K> = {
  [S in keyof R["responses"] & ContentfulStatusCode]: K extends CodeOf<R, S>
    ? TypedResponse<{ error: { code: K; message: string } }, S, "json">
    : never;
}[keyof R["responses"] & ContentfulStatusCode];

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
   * 想定内の失敗。宣言していないコードを渡すと、引数に「宣言してあるのはこれ」と赤線が付く。
   * そのとき戻り値は never にして、handler の頭に同じ原因の赤線が重ならないようにする
   */
  failure<K extends string>(
    // & string は、エラーメッセージで型の名前ではなく中身（"NOT_FOUND" など）を見せるため
    error: [K] extends [DeclaredFailure<R>] ? K : DeclaredFailure<R> & string,
  ): [K] extends [DeclaredFailure<R>] ? FailureResponse<R, K> : never;
};

/** 宣言の中から、そのコードの失敗を探す。何番で、どの文言で返すかは宣言が知っている */
const findDeclaredFailure = (route: RouteConfig, code: string) => {
  for (const [status, response] of Object.entries(route.responses)) {
    const { description, content } = response as {
      description: string;
      content?: Record<string, { schema?: unknown }>;
    };
    const schema = content?.["application/json"]?.schema;
    const literal = (schema as z.ZodObject | undefined)?.shape?.error;
    const codeSchema = (literal as z.ZodObject | undefined)?.shape?.code as z.ZodLiteral | undefined;
    if (codeSchema?.values?.has(code)) {
      return { status: Number(status) as ContentfulStatusCode, message: description };
    }
  }
  throw new Error(`${code} is not declared in the responses of ${route.method.toUpperCase()} ${route.path}`);
};

/**
 * route の宣言と handler を組にする。
 * `.openapi(...createEndpoint(createRoute({...}), async (c, reply) => ...))`
 */
export const createEndpoint = <const R extends RouteConfig>(
  route: R,
  fn: (
    c: Parameters<RouteHandler<R, RouteConfigToEnv<R> & RegisteredEnv>>[0],
    reply: Reply<R>,
  ) => MaybePromise<RouteConfigToTypedResponse<R>>,
) => {
  const handler: RouteHandler<R, RouteConfigToEnv<R> & RegisteredEnv> = (c: Context) => {
    const reply = ((status: number, body: unknown) =>
      c.json(body as never, status as never)) as unknown as Reply<R>;
    reply.failure = ((code: string) => {
      const declared = findDeclaredFailure(route, code);
      return c.json(errorBody(code, declared.message), declared.status);
    }) as unknown as Reply<R>["failure"];

    // R が決まっていないここでは TS が照らし合わせきれないので付け替える。使う側では fn の型で守られる
    return fn(c as never, reply) as never;
  };

  return [route, handler] as const;
};
