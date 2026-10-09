import { Hono, type Env, type Handler, type Input, type Schema, type ToSchema } from "hono";
import { validator } from "hono/validator";
import type { H, MergePath } from "hono/types";
import { fail, ValidationError } from "./failure";
import type {
  AnySchema,
  ComputeInput,
  RouteConfig,
  RouteConfigToEnv,
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
  const { params, query, headers, cookies, body } = route.request ?? {};
  const json = body && Object.entries(body.content).find(([type]) => /json/.test(type));

  return [
    params && check("param", params),
    query && check("query", query),
    headers && check("header", headers),
    cookies && check("cookie", cookies),
    json && check("json", json[1].schema),
  ].filter((v): v is NonNullable<typeof v> => !!v);
};

/**
 * route をまとめる Hono。`openapi(route, handler)` で、宣言と handler を組にして登録する。
 * 宣言から、c.req.valid() の型と、hc の応答の型が決まる
 */
export class Router<
  E extends Env = Env,
  S extends Schema = {},
  BasePath extends string = "/",
> extends Hono<E, S, BasePath> {
  openapi<
    R extends RouteConfig,
    I extends Input = ComputeInput<R>,
    P extends string = R["path"],
  >(
    route: R,
    handler: Handler<
      R["middleware"] extends H | H[] ? RouteConfigToEnv<R> & E : E,
      P,
      I,
      RouteConfigToTypedResponse<R> | Promise<RouteConfigToTypedResponse<R>>
    >,
  ): Router<
    E,
    S & ToSchema<R["method"], MergePath<BasePath, P>, I, RouteConfigToTypedResponse<R>>,
    BasePath
  > {
    const middleware = [route.middleware ?? []].flat();
    const last = Object.assign(
      (c: unknown, next: unknown) => (handler as unknown as Function)(c, next),
      { [ROUTE]: route },
    );

    // 型は引数の宣言で守られている。Hono の on は、この中では型を照らし合わせきれない
    ((this as unknown as Hono<any, any, any>).on as (...args: unknown[]) => unknown).call(this, route.method.toUpperCase(), route.path, ...([
      ...middleware,
      ...validatorsOf(route),
      last,
    ] as unknown[]));

    return this as never;
  }
}
