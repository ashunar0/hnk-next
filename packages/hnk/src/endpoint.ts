import type { Context, MiddlewareHandler, TypedResponse } from "hono";
import type { ParamKeys } from "hono/types";
import { z } from "zod";
import type {
  ContentfulStatusCode,
  SuccessStatusCode,
} from "hono/utils/http-status";
import type { JSONParsed } from "hono/utils/types";

import { errorBody, fail, ValidationError, type HttpError } from "./failure";
import type { RegisteredDeps, RegisteredEnv } from "./register";
import {
  type AnySchema,
  type RouteConfig,
  type RouteConfigToEnv,
  type RouteConfigToTypedResponse,
  type RouteHandler,
} from "./route-types";
import { Router } from "./router";
import type { InferInput, InferOutput } from "./standard-schema";

import type { System } from "./system";

/**
 * `as never` / `as unknown as` を使うのは、hnk ではこのファイルの次の 3 つだけ。
 * - provideDeps の `c.set` と、createEndpoint の `c.get`: 内部のキー（DEPS_KEY）は、アプリの Env の変数に載せない
 * - errorResponses の戻り値: 実行時に組み立てた object に、番号ごとの失敗の型を付ける
 * - createEndpoint の handler の中の `reply` と `fn(c, ...)`: route の型 R が決まらないここでは、
 *   TS が Hono のジェネリクスを照らし合わせきれない
 * ここで型を信じてもらう代わりに、使う側は createEndpoint の fn の型（c、reply、deps）で守られる
 */

// ---- 依存 ----

/** hnk の中だけで使う置き場所。アプリのコードは c.var から依存を取り出さない */
const DEPS_KEY = "hnk:deps";

/**
 * リクエストごとに依存を組み立てる middleware。`app.use("*", provideDeps(makeDeps))`。
 *
 * 起動時に 1 回だけ組み立てると、接続を持つ DB では Workers がリクエストをまたいだ
 * I/O を拒む。だから組み立てた結果ではなく、組み立て方を受け取る。
 * ここでは組み立てない。endpoint の handler が初めて受け取るときに 1 回だけ組み立てるので、
 * 401 で返すだけのリクエストや /openapi.json では何も作られない
 */
export const provideDeps =
  (
    makeDeps: (env: RegisteredEnv["Bindings"]) => RegisteredDeps,
  ): MiddlewareHandler =>
  async (c, next) => {
    let made: RegisteredDeps | undefined;
    const resolve = () => (made ??= makeDeps(c.env));
    c.set(DEPS_KEY as never, resolve as never);
    await next();
  };

type MaybePromise<T> = T | Promise<T>;
// ---- router ----

/** route をまとめる Hono。`new Hono()` の代わり。検証に失敗したら throw して onError へ流す */
export const createRouter = () => new Router<RegisteredEnv>();

// ---- responses の宣言 ----

/**
 * JSON の本文。required を必ず付ける——付けないと、Content-Type の無いリクエストで
 * 検査そのものが飛ばされる
 */
export const jsonBody = <T extends AnySchema>(schema: T) => ({
  required: true,
  content: { "application/json": { schema } },
});

/** JSON の応答 1 つ */
export const json = <T extends AnySchema>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

const errorSchema = <K extends string>(codes: readonly K[]) =>
  z.object({
    error: z.object({ code: z.literal(codes), message: z.string() }),
  });

/** 応答の宣言に、その番号で返しうる失敗を覚えさせる。OpenAPI には出ない */
const DECLARED_ERRORS: unique symbol = Symbol("hnk.declaredErrors");

type ErrorResponse = ReturnType<typeof json> & {
  readonly [DECLARED_ERRORS]: readonly HttpError[];
};

/** 同じ番号の失敗を 1 つの応答にまとめる。コードは literal の和、文言はコードごとに覚えておく */
const errorResponseOf = (errors: readonly HttpError[]): ErrorResponse => ({
  ...json(
    errorSchema(errors.map((e) => e.code)),
    errors.map((e) => e.message).join(" / "),
  ),
  [DECLARED_ERRORS]: errors,
});

/**
 * responses の失敗の部分。ステータスは失敗が持っているので、手では書かない。
 * `responses: { 200: json(...), ...errorResponses(Unauthorized, NotFound) }`
 * 同じ番号の失敗が複数あっても、1 つの応答にまとめるので消えない
 */
export const errorResponses = <const T extends readonly HttpError[]>(
  ...errors: T
) => {
  const byStatus = new Map<number, HttpError[]>();
  for (const e of errors)
    byStatus.set(e.status, [...(byStatus.get(e.status) ?? []), e]);

  return Object.fromEntries(
    [...byStatus].map(([status, group]) => [status, errorResponseOf(group)]),
  ) as unknown as ErrorResponses<T[number]>;
};

type ErrorResponses<E extends HttpError> = {
  [S in E["status"]]: {
    description: string;
    content: {
      "application/json": {
        schema: ReturnType<
          typeof errorSchema<Extract<E, { status: S }>["code"]>
        >;
      };
    };
  };
};

/** 2 つの responses を重ねる。同じ番号の失敗の宣言どうしは、片方で消さずにまとめる */
const mergeResponses = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
) => {
  const merged: Record<string, unknown> = { ...a, ...b };
  for (const status of Object.keys(a)) {
    const left = (a[status] as Partial<ErrorResponse>)[DECLARED_ERRORS];
    const right = (b[status] as Partial<ErrorResponse> | undefined)?.[
      DECLARED_ERRORS
    ];
    if (left && right) merged[status] = errorResponseOf([...left, ...right]);
  }
  return merged;
};

// ---- guard と、失敗の自動の宣言 ----

const GUARD_ERRORS: unique symbol = Symbol("hnk.guardErrors");

/** 返しうる失敗を持った middleware */
export type Guard<
  M extends MiddlewareHandler,
  E extends readonly HttpError[],
> = M & {
  readonly [GUARD_ERRORS]: E;
};

/**
 * middleware に、それが返しうる失敗を持たせる。createEndpoint の middleware に置くと、
 * その失敗が responses に自動で足される。`export const requireAuth = guard([Unauthorized], ...)`
 */
export const guard = <
  const E extends readonly HttpError[],
  M extends MiddlewareHandler,
>(
  errors: E,
  middleware: M,
): Guard<M, E> => Object.assign(middleware, { [GUARD_ERRORS]: errors });

type GuardErrorsOf<M> = M extends readonly unknown[]
  ? GuardErrorsOf<M[number]>
  : M extends { readonly [GUARD_ERRORS]: infer E extends readonly HttpError[] }
    ? E[number]
    : never;

const INPUT_PARTS = ["params", "query", "body", "headers", "cookies"] as const;

/** 入力の検査があるか。あれば ValidationError を返しうる */
type HasInput<R> = R extends { request: infer Q }
  ? Extract<keyof Q, (typeof INPUT_PARTS)[number]> extends never
    ? false
    : true
  : false;

/** 自動で足す失敗。guard が持つものと、入力があれば ValidationError */
type AutoErrors<R> =
  | GuardErrorsOf<R extends { middleware: infer M } ? M : never>
  | (HasInput<R> extends true ? typeof ValidationError : never);

/** 手で書いた失敗のコード。reply.failure が受け取れるのはこれだけ */
declare const DECLARED_BY_HAND: unique symbol;

type WithAutoErrors<R extends RouteConfig> = Omit<R, "responses"> & {
  responses: R["responses"] & ErrorResponses<AutoErrors<R>>;
  readonly [DECLARED_BY_HAND]?: {
    [S in keyof R["responses"]]: CodeOf<R, S>;
  }[keyof R["responses"]];
};

/**
 * route の宣言に、失敗の自動の宣言を足したもの。
 * guard が返しうる失敗（requireAuth なら Unauthorized）と、入力があるときの ValidationError は
 * responses に書かなくていい。書くのはドメインの失敗だけ
 */
const createRoute = <const R extends RouteConfig>(config: R) => {
  const middleware = [config.middleware ?? []].flat() as {
    [GUARD_ERRORS]?: readonly HttpError[];
  }[];
  const auto: HttpError[] = middleware.flatMap((m) => m[GUARD_ERRORS] ?? []);
  if (INPUT_PARTS.some((part) => config.request?.[part] !== undefined))
    auto.push(ValidationError);

  return {
    ...config,
    responses: mergeResponses(errorResponses(...auto), config.responses),
  } as WithAutoErrors<R>;
};

// ---- reply ----

type JsonSchemaOf<R extends RouteConfig, S> = S extends keyof R["responses"]
  ? R["responses"][S] extends {
      content: { "application/json": { schema: infer Z extends AnySchema } };
    }
    ? Z
    : never
  : never;

type JsonBodyOf<R extends RouteConfig, S> = InferOutput<JsonSchemaOf<R, S>>;

type CodeOf<R extends RouteConfig, S> =
  JsonBodyOf<R, S> extends { error: { code: infer K } } ? K : never;

/** 2xx のうち、この route が宣言したもの */
type DeclaredSuccess<R extends RouteConfig> = keyof R["responses"] &
  SuccessStatusCode;

/** createRoute が組み立てた route の型 */
type Built<C extends RouteConfig> = ReturnType<typeof createRoute<C>>;

/**
 * reply.failure が受け取れる失敗のコード。hnk の createEndpoint なら手で書いたものだけ
 * （guard や入力の検査が返す失敗は、handler が返すものではないので除く）
 */
type DeclaredFailure<R extends RouteConfig> = R extends {
  readonly [DECLARED_BY_HAND]?: infer K;
}
  ? Exclude<K, undefined>
  : { [S in keyof R["responses"]]: CodeOf<R, S> }[keyof R["responses"]];

/**
 * 失敗を 1 つも宣言していない route で reply.failure を呼んだとき、引数の型としてエラーに出る文言。
 * ここを `never` にすると、赤線の理由が読めなくなる
 */
type NoFailureDeclared =
  "この route には、手で書いた失敗の宣言が無い。responses に ...errorResponses(NotFound など) を足す";

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
    error: [K] extends [DeclaredFailure<R>]
      ? K
      : [DeclaredFailure<R>] extends [never]
        ? NoFailureDeclared
        : DeclaredFailure<R> & string,
  ): [K] extends [DeclaredFailure<R>] ? FailureResponse<R, K> : never;
};

/** 宣言の中から、そのコードの失敗を探す。何番で、どの文言で返すかは宣言が知っている */
const findDeclaredFailure = (route: RouteConfig, code: string) => {
  for (const [status, response] of Object.entries(route.responses)) {
    const declared = (response as Partial<ErrorResponse>)[
      DECLARED_ERRORS
    ]?.find((e) => e.code === code);
    if (declared)
      return {
        status: Number(status) as ContentfulStatusCode,
        message: declared.message,
      };
  }
  throw new Error(
    `${code} is not declared in the responses of ${route.method.toUpperCase()} ${route.path}`,
  );
};

/** request.params のキー */
type ParamsKeysOf<C extends RouteConfig> = C extends {
  request: { params: infer S extends AnySchema };
}
  ? keyof InferInput<S> & string
  : never;

/**
 * path の `:name` と request.params のキーが食い違っているとき、赤線に出る文言。
 * 食い違っていると、実行時に検査が常に失敗するか、値が取れない
 */
type PathMismatch<C extends RouteConfig> = [
  | Exclude<ParamKeys<C["path"]>, ParamsKeysOf<C>>
  | Exclude<ParamsKeysOf<C>, ParamKeys<C["path"]>>,
] extends [never]
  ? never
  : `path のパラメータ（${ParamKeys<C["path"]>}）と request.params のキー（${ParamsKeysOf<C>}）が合っていない`;

/**
 * route の宣言と handler を組にする。
 * `.endpoint(...createEndpoint({...}, async (c, reply, { invoices }) => ...))`。
 * 受け取る（c）、返す（reply）、使う（deps）が、引数の位置で決まる
 */
export const createEndpoint = <const C extends RouteConfig>(
  config: C &
    ([PathMismatch<C>] extends [never]
      ? unknown
      : { readonly "path と request.params が合っていない": PathMismatch<C> }),
  fn: (
    c: Parameters<
      RouteHandler<Built<C>, RouteConfigToEnv<Built<C>> & RegisteredEnv>
    >[0],
    reply: Reply<Built<C>>,
    deps: RegisteredDeps,
  ) => MaybePromise<RouteConfigToTypedResponse<Built<C>>>,
) => {
  const route = createRoute(config);
  const handler: RouteHandler<
    Built<C>,
    RouteConfigToEnv<Built<C>> & RegisteredEnv
  > = (c: Context) => {
    const reply = ((status: number, body: unknown) =>
      c.json(body as never, status as never)) as unknown as Reply<Built<C>>;
    reply.failure = ((code: string) => {
      const declared = findDeclaredFailure(route, code);
      return c.json(errorBody(code, declared.message), declared.status);
    }) as unknown as Reply<Built<C>>["failure"];

    const resolve = c.get(DEPS_KEY as never) as
      (() => RegisteredDeps) | undefined;
    if (resolve === undefined)
      throw new Error(
        'provideDeps が use されていない。app.use("*", provideDeps(makeDeps))',
      );
    const deps = resolve();

    // R が決まっていないここでは TS が照らし合わせきれないので付け替える。使う側では fn の型で守られる
    return fn(c as never, reply, deps) as never;
  };

  return [route, handler] as const;
};
