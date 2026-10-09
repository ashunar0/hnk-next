import {
  Hono,
  type Env,
  type Handler,
  type Input,
  type Schema,
  type ToSchema,
} from "hono";
import { validator } from "hono/validator";
import type { MergePath } from "hono/types";
import {
  buildEndpoint,
  type BuiltRoute,
  type EndpointConfig,
  type EndpointFn,
} from "./endpoint";
import { fail, ValidationError } from "./failure";
import type { RegisteredEnv } from "./register";
import type {
  AnySchema,
  ComputeInput,
  RouteConfig,
  RouteConfigToTypedResponse,
} from "./route-types";

/** handler に、宣言を覚えさせる。OpenAPI の文書は、登録された handler からこれを読んで作る */
export const ROUTE: unique symbol = Symbol("hnk.route");

/** 入力の検査。Standard Schema を満たすものなら何でも。失敗は ValidationError で onError へ流す */
const check = (
  target: "param" | "query" | "header" | "cookie" | "json",
  schema: AnySchema,
) =>
  validator(target, async (value) => {
    const result = await schema["~standard"].validate(value);
    if (result.issues) throw fail(ValidationError, result.issues[0]?.message);

    return result.value;
  });

const validatorsOf = (route: RouteConfig) => {
  const { param, query, header, cookie, json } = route.request ?? {};

  return [
    param && check("param", param),
    query && check("query", query),
    header && check("header", header),
    cookie && check("cookie", cookie),
    json && check("json", json),
  ].filter((v): v is NonNullable<typeof v> => !!v);
};

/**
 * route をまとめる Hono。`.endpoint(config, fn)` で、宣言と handler を組にして登録する。
 * 宣言から、c.req.valid() の型と、hc の応答の型が決まる
 */
export class Router<
  E extends Env = Env,
  S extends Schema = {},
  BasePath extends string = "/",
> extends Hono<E, S, BasePath> {
  endpoint<const C extends RouteConfig>(
    config: EndpointConfig<C>,
    fn: EndpointFn<C>,
  ): Router<
    E,
    S &
      ToSchema<
        C["method"],
        MergePath<BasePath, C["path"]>,
        ComputeInput<BuiltRoute<C>>,
        RouteConfigToTypedResponse<BuiltRoute<C>>
      >,
    BasePath
  > {
    const [route, handler] = buildEndpoint(config as C, fn);
    const middleware = [route.middleware ?? []].flat();
    const last = Object.assign(handler, { [ROUTE]: route });

    // 型は引数の宣言で守られている。Hono の on は、この中では型を照らし合わせきれない
    (
      (this as unknown as Hono<any, any, any>).on as (
        ...args: unknown[]
      ) => unknown
    ).call(
      this,
      route.method.toUpperCase(),
      route.path,
      ...([...middleware, ...validatorsOf(route), last] as unknown[]),
    );

    return this as never;
  }
}

/** route をまとめる Hono。`new Hono()` の代わり */
export const createRouter = () => new Router<RegisteredEnv>();
