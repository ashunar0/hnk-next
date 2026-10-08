import {
  createRoute as zodCreateRoute,
  OpenAPIHono,
  z,
  type RouteConfig,
  type RouteConfigToEnv,
  type RouteConfigToTypedResponse,
  type RouteHandler,
} from "@hono/zod-openapi";
import type {
  Context,
  Env,
  ErrorHandler,
  MiddlewareHandler,
  TypedResponse,
} from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type {
  ContentfulStatusCode,
  SuccessStatusCode,
} from "hono/utils/http-status";
import type { JSONParsed } from "hono/utils/types";

import type { Result } from "./result";
import { systemViewer } from "./system-value";
import type { System } from "./system";

export { err, ok, type Result } from "./result";
export type { System } from "./system";

/**
 * アプリが型を登録する場所。AppEnv を定義するファイルで
 * `declare module "hnk" { interface Register { env: AppEnv } }`、
 * 組み立てのファイルで `interface Register { deps: Deps }` と書く
 */
export interface Register {}

type RegisteredEnv = Register extends { env: infer E extends Env } ? E : Env;

type RegisteredDeps = Register extends { deps: infer D }
  ? D
  : Record<string, never>;

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

// ---- 失敗 ----

/** HTTP で返す失敗 1 つ。コード、何番か、既定の文言を持つ */
export type HttpError<
  K extends string = string,
  S extends ContentfulStatusCode = ContentfulStatusCode,
> = {
  readonly code: K;
  readonly status: S;
  readonly message: string;
};

/** `export const NotFound = httpError("NOT_FOUND", 404, "対象が見つかりません");` */
export const httpError = <
  const K extends string,
  const S extends ContentfulStatusCode,
>(
  code: K,
  status: S,
  message: string,
): HttpError<K, S> => ({ code, status, message });

/** 入力の検査に失敗したとき。createRouter が使う */
export const ValidationError = httpError(
  "VALIDATION_ERROR",
  400,
  "Invalid request",
);

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

const errorBody = (code: string, message: string) => ({
  error: { code, message },
});

/** 全ての失敗の唯一の出口。`app.onError(onError)` */
export const onError: ErrorHandler = (error, c) => {
  if (error instanceof HnkError) {
    return c.json(
      errorBody(error.code, error.message),
      error.status as ContentfulStatusCode,
    );
  }
  if (error instanceof HTTPException) {
    return c.json(
      errorBody("INTERNAL", error.message),
      error.status as ContentfulStatusCode,
    );
  }
  console.error("[unhandled]", error);
  return c.json(errorBody("INTERNAL", "Internal Server Error"), 500);
};

// ---- router ----

/** route をまとめる Hono。`new Hono()` の代わり。検証に失敗したら throw して onError へ流す */
export const createRouter = () =>
  new OpenAPIHono<RegisteredEnv>({
    defaultHook: (result) => {
      if (!result.success)
        throw fail(ValidationError, result.error.issues[0]?.message);
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
 * middleware に、それが返しうる失敗を持たせる。createRoute の middleware に置くと、
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
 * route の宣言。zod-openapi の createRoute に、失敗の自動の宣言を足したもの。
 * guard が返しうる失敗（requireAuth なら Unauthorized）と、入力があるときの ValidationError は
 * responses に書かなくていい。書くのはドメインの失敗だけ
 */
export const createRoute = <const R extends RouteConfig>(config: R) => {
  const middleware = [config.middleware ?? []].flat() as {
    [GUARD_ERRORS]?: readonly HttpError[];
  }[];
  const auto: HttpError[] = middleware.flatMap((m) => m[GUARD_ERRORS] ?? []);
  if (INPUT_PARTS.some((part) => config.request?.[part] !== undefined))
    auto.push(ValidationError);

  return zodCreateRoute({
    ...config,
    responses: mergeResponses(errorResponses(...auto), config.responses),
  } as WithAutoErrors<R>);
};

// ---- reply ----

type JsonSchemaOf<R extends RouteConfig, S> = S extends keyof R["responses"]
  ? R["responses"][S] extends {
      content: { "application/json": { schema: infer Z extends z.ZodType } };
    }
    ? Z
    : never
  : never;

type JsonBodyOf<R extends RouteConfig, S> = z.infer<JsonSchemaOf<R, S>>;

type CodeOf<R extends RouteConfig, S> =
  JsonBodyOf<R, S> extends { error: { code: infer K } } ? K : never;

/** 2xx のうち、この route が宣言したもの */
type DeclaredSuccess<R extends RouteConfig> = keyof R["responses"] &
  SuccessStatusCode;

/**
 * reply.failure が受け取れる失敗のコード。hnk の createRoute なら手で書いたものだけ
 * （guard や入力の検査が返す失敗は、handler が返すものではないので除く）
 */
type DeclaredFailure<R extends RouteConfig> = R extends {
  readonly [DECLARED_BY_HAND]?: infer K;
}
  ? Exclude<K, undefined>
  : { [S in keyof R["responses"]]: CodeOf<R, S> }[keyof R["responses"]];

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

/**
 * route の宣言と handler を組にする。
 * `.openapi(...createEndpoint(createRoute({...}), async (c, reply, { invoices }) => ...))`。
 * 受け取る（c）、返す（reply）、使う（deps）が、引数の位置で決まる
 */
export const createEndpoint = <const R extends RouteConfig>(
  route: R,
  fn: (
    c: Parameters<RouteHandler<R, RouteConfigToEnv<R> & RegisteredEnv>>[0],
    reply: Reply<R>,
    deps: RegisteredDeps,
  ) => MaybePromise<RouteConfigToTypedResponse<R>>,
) => {
  const handler: RouteHandler<R, RouteConfigToEnv<R> & RegisteredEnv> = (
    c: Context,
  ) => {
    const reply = ((status: number, body: unknown) =>
      c.json(body as never, status as never)) as unknown as Reply<R>;
    reply.failure = ((code: string) => {
      const declared = findDeclaredFailure(route, code);
      return c.json(errorBody(code, declared.message), declared.status);
    }) as unknown as Reply<R>["failure"];

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

// ---- HTTP 以外の入口 ----

/** 入口が受け取るもの。誰として呼ぶか（system）も、いつの出来事か（now）も、入口が決めずに受け取る */
export type CronContext = {
  deps: RegisteredDeps;
  system: System;
  /** 予定されていた時刻（実際に動いた時刻ではない） */
  now: Date;
};

export type QueueContext<Body> = CronContext & {
  body: Body;
};

type Bindings = RegisteredEnv["Bindings"];

/**
 * Workers の入口。HTTP は fetch、時刻は scheduled、キューは queue に渡す。
 *
 * - 依存は呼び出しごとに 1 回、makeDeps で組み立てる（HTTP は provideDeps が同じことをする）
 * - 利用者のいない入口なので、service を呼ぶための system をここが渡す。入口のファイルは作らず、受け取るだけ
 * - now はイベントから渡す。scheduled は予定の時刻、queue はメッセージが積まれた時刻
 *   （再送が日をまたいでも、同じ日付のまま扱える）
 * - queue の handler は Result を返す。ok なら ack、err なら retry。想定外の throw も、
 *   そのメッセージだけ retry にして、同じバッチの残りは処理を続ける
 */
export const createWorker = <Body = never>(options: {
  makeDeps: (env: Bindings) => RegisteredDeps;
  fetch: (
    request: Request,
    env: Bindings,
    ctx: ExecutionContext,
  ) => Response | Promise<Response>;
  scheduled?: (context: CronContext) => Promise<void>;
  queue?: (context: QueueContext<Body>) => Promise<Result<unknown, string>>;
}): ExportedHandler<Bindings, Body> => {
  const { makeDeps, fetch, scheduled, queue } = options;

  return {
    fetch,
    ...(scheduled && {
      async scheduled(controller, env) {
        await scheduled({
          deps: makeDeps(env),
          system: systemViewer,
          now: new Date(controller.scheduledTime),
        });
      },
    }),
    ...(queue && {
      async queue(batch, env) {
        const deps = makeDeps(env);

        for (const message of batch.messages) {
          try {
            const result = await queue({
              deps,
              system: systemViewer,
              now: message.timestamp,
              body: message.body,
            });
            if (result.ok) message.ack();
            else message.retry();
          } catch (error) {
            console.error("[queue] unhandled", error);
            message.retry();
          }
        }
      },
    }),
  };
};

/**
 * 認証を別の方法で確かめる入口（署名つきの webhook など）の宣言。
 * allowAnonymous と同じ並びで、route の middleware の先頭に置き、handler は `c.get("system")` で受け取る。
 * 署名を確かめるのは handler の仕事——確かめる前に system を使わない
 */
export const allowSystem = createMiddleware<{ Variables: { system: System } }>(
  async (c, next) => {
    c.set("system", systemViewer);
    await next();
  },
);
