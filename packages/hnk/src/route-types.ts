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

import type { InferInput, InferOutput, StandardSchema } from "./standard-schema";

type MaybePromise<T> = Promise<T> | T;

export type AnySchema = StandardSchema<any, any>;

type Content = { [mediaType: string]: { schema: AnySchema } };

/** route の宣言。形は OpenAPI の route の宣言に合わせてある（method は小文字） */
export type RouteConfig = {
  method: "get" | "post" | "put" | "patch" | "delete";
  /** Hono の書き方。`/users/:id` */
  path: string;
  middleware?: H | H[];
  request?: {
    params?: AnySchema;
    query?: AnySchema;
    headers?: AnySchema;
    cookies?: AnySchema;
    body?: { required?: boolean; content: Content };
  };
  responses: {
    [status: number]: { description: string; content?: Content };
  };
};

// ---- 入力 ----

type RequestPart<R extends RouteConfig, Part extends string> =
  R["request"] extends infer Q
    ? Part extends keyof Q
      ? Q[Part]
      : {}
    : {};

type HasUndefined<T> = undefined extends T ? true : false;

type InputTypeBase<
  R extends RouteConfig,
  Part extends string,
  Type extends keyof ValidationTargets,
> =
  RequestPart<R, Part> extends infer S extends AnySchema
    ? {
        in: {
          [K in Type]: HasUndefined<ValidationTargets[K]> extends true
            ? { [K2 in keyof InferInput<S>]?: InferInput<S>[K2] }
            : { [K2 in keyof InferInput<S>]: InferInput<S>[K2] };
        };
        out: { [K in Type]: InferOutput<S> };
      }
    : {};

type IsJson<T> = T extends string
  ? T extends `application/${infer Start}json${infer _End}`
    ? Start extends "" | `${string}+` | `vnd.${string}+`
      ? "json"
      : never
    : never
  : never;

type InputTypeJson<R extends RouteConfig> =
  R["request"] extends { body: { content: infer C extends Content } }
    ? IsJson<keyof C> extends never
      ? {}
      : C[keyof C] extends { schema: infer S extends AnySchema }
        ? { in: { json: InferInput<S> }; out: { json: InferOutput<S> } }
        : {}
    : {};

export type ComputeInput<R extends RouteConfig> = InputTypeBase<R, "params", "param"> &
  InputTypeBase<R, "query", "query"> &
  InputTypeBase<R, "headers", "header"> &
  InputTypeBase<R, "cookies", "cookie"> &
  InputTypeJson<R>;

// ---- 出力 ----

type ExtractContent<T> = T extends { [K in keyof T]: infer A }
  ? A extends { schema: infer S extends AnySchema }
    ? InferOutput<S>
    : never
  : never;

type ReturnJson<ContentType, Content, Code extends StatusCode> =
  ContentType extends `application/${infer Start}json${infer _End}`
    ? Start extends "" | `${string}+` | `vnd.${string}+`
      ? TypedResponse<JSONParsed<Content>, Code, "json">
      : never
    : never;

type DefinedStatusCodes<R extends RouteConfig> = keyof R["responses"] & StatusCode;

/** 宣言した応答の和。hc の応答の型になる */
export type RouteConfigToTypedResponse<R extends RouteConfig> = {
  [Status in DefinedStatusCodes<R>]: Status extends StatusCode
    ? R["responses"][Status] extends { content: infer Content }
      ? undefined extends Content
        ? never
        : ReturnJson<keyof Content, ExtractContent<Content>, Status>
      : TypedResponse<{}, Status, string>
    : never;
}[DefinedStatusCodes<R>];

// ---- middleware の Env ----

type AsArray<T> = T extends undefined ? [] : T extends any[] ? T : [T];

type DeepSimplify<T> = {
  [K in keyof T]: T[K] extends Record<string, unknown> ? DeepSimplify<T[K]> : T[K];
} & {};

type OfHandlerType<T extends MiddlewareHandler> =
  T extends MiddlewareHandler<infer E, infer P, infer I>
    ? { env: E; path: P; input: I }
    : never;

/** 並べた middleware を 1 つにまとめた型（Env を重ねる） */
type MiddlewareToHandlerType<M extends MiddlewareHandler<any, any, any>[]> = M extends [
  infer First,
  infer Second,
  ...infer Rest,
]
  ? First extends MiddlewareHandler<any, any, any>
    ? Second extends MiddlewareHandler<any, any, any>
      ? Rest extends MiddlewareHandler<any, any, any>[]
        ? MiddlewareToHandlerType<
            [
              MiddlewareHandler<
                DeepSimplify<OfHandlerType<First>["env"] & OfHandlerType<Second>["env"]>,
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
  RouteMiddlewareParams<R> extends never ? Env : RouteMiddlewareParams<R>["env"];

/** handler。c.req.valid() と c が宣言から決まり、返せるのは宣言した応答だけ */
export type RouteHandler<
  R extends RouteConfig,
  E extends Env = RouteConfigToEnv<R>,
  I extends Input = ComputeInput<R>,
  P extends string = R["path"],
> = Handler<E, P, I, MaybePromise<RouteConfigToTypedResponse<R>>>;
