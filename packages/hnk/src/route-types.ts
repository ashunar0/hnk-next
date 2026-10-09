/**
 * route の宣言（config）と、そこから決まる型。Hono の Handler / ToSchema に載せるので、
 * c.req.valid()、reply、hc の応答の型が、宣言から決まる
 */
import type {
  Env,
  Handler,
  Input,
  MiddlewareHandler,
  TypedResponse,
  ValidationTargets,
} from "hono";
import type { H } from "hono/types";
import type { StatusCode } from "hono/utils/http-status";
import type { JSONParsed } from "hono/utils/types";

import type {
  InferInput,
  InferOutput,
  StandardSchema,
} from "./standard-schema";

type MaybePromise<T> = Promise<T> | T;

export type AnySchema = StandardSchema<any, any>;

/**
 * 応答の宣言 1 つ。スキーマだけ書くか、説明（OpenAPI の文書に出る）を付けるときは `json(schema, "説明")`。
 * スキーマは Standard Schema の `~standard` を持つので、`{ schema, description }` とは見分けられる
 */
export type ResponseEntry =
  AnySchema | { schema: AnySchema; description: string };

/**
 * route の宣言。request のキーは、handler で読むときの `c.req.valid("…")` の名前と同じ
 * （`param` を宣言したら `c.req.valid("param")`）。method は小文字、path は Hono の書き方（`/users/:id`）
 */
export type RouteConfig = {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  middleware?: H | H[];
  request?: {
    param?: AnySchema;
    query?: AnySchema;
    header?: AnySchema;
    cookie?: AnySchema;
    /** JSON の本文 */
    json?: AnySchema;
  };
  responses: { [status: number]: ResponseEntry };
};

/** 応答の宣言から、スキーマを取り出す */
export type SchemaOfResponse<T> = T extends AnySchema
  ? T
  : T extends { schema: infer S extends AnySchema }
    ? S
    : never;

// ---- 入力 ----

type HasUndefined<T> = undefined extends T ? true : false;

type InputTypeBase<
  R extends RouteConfig,
  Part extends keyof ValidationTargets,
> = R["request"] extends { [K in Part]: infer S extends AnySchema }
  ? {
      in: {
        [K in Part]: HasUndefined<ValidationTargets[K]> extends true
          ? { [K2 in keyof InferInput<S>]?: InferInput<S>[K2] }
          : { [K2 in keyof InferInput<S>]: InferInput<S>[K2] };
      };
      out: { [K in Part]: InferOutput<S> };
    }
  : {};

type InputTypeJson<R extends RouteConfig> = R["request"] extends {
  json: infer S extends AnySchema;
}
  ? { in: { json: InferInput<S> }; out: { json: InferOutput<S> } }
  : {};

export type ComputeInput<R extends RouteConfig> = InputTypeBase<R, "param"> &
  InputTypeBase<R, "query"> &
  InputTypeBase<R, "header"> &
  InputTypeBase<R, "cookie"> &
  InputTypeJson<R>;

// ---- 出力 ----

type DefinedStatusCodes<R extends RouteConfig> = keyof R["responses"] &
  StatusCode;

/** 宣言した応答の和。hc の応答の型になる */
export type RouteConfigToTypedResponse<R extends RouteConfig> = {
  [Status in DefinedStatusCodes<R>]: TypedResponse<
    JSONParsed<InferOutput<SchemaOfResponse<R["responses"][Status]>>>,
    Status,
    "json"
  >;
}[DefinedStatusCodes<R>];

// ---- middleware の Env ----

type AsArray<T> = T extends undefined ? [] : T extends any[] ? T : [T];

type DeepSimplify<T> = {
  [K in keyof T]: T[K] extends Record<string, unknown>
    ? DeepSimplify<T[K]>
    : T[K];
} & {};

type OfHandlerType<T extends MiddlewareHandler> =
  T extends MiddlewareHandler<infer E, infer P, infer I>
    ? { env: E; path: P; input: I }
    : never;

/** 並べた middleware を 1 つにまとめた型（Env を重ねる） */
type MiddlewareToHandlerType<M extends MiddlewareHandler<any, any, any>[]> =
  M extends [infer First, infer Second, ...infer Rest]
    ? First extends MiddlewareHandler<any, any, any>
      ? Second extends MiddlewareHandler<any, any, any>
        ? Rest extends MiddlewareHandler<any, any, any>[]
          ? MiddlewareToHandlerType<
              [
                MiddlewareHandler<
                  DeepSimplify<
                    OfHandlerType<First>["env"] & OfHandlerType<Second>["env"]
                  >,
                  OfHandlerType<First>["path"],
                  OfHandlerType<First>["input"]
                >,
                ...Rest,
              ]
            >
          : never
        : never
      : never
    : M extends [infer Last]
      ? Last
      : MiddlewareHandler<Env>;

type RouteMiddlewareParams<R extends RouteConfig> = OfHandlerType<
  MiddlewareToHandlerType<AsArray<R["middleware"]>>
>;

export type RouteConfigToEnv<R extends RouteConfig> =
  RouteMiddlewareParams<R> extends never
    ? Env
    : RouteMiddlewareParams<R>["env"];

/** handler。c.req.valid() と c が宣言から決まり、返せるのは宣言した応答だけ */
export type RouteHandler<
  R extends RouteConfig,
  E extends Env = RouteConfigToEnv<R>,
  I extends Input = ComputeInput<R>,
  P extends string = R["path"],
> = Handler<E, P, I, MaybePromise<RouteConfigToTypedResponse<R>>>;
