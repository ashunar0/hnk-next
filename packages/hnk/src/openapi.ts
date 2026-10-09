/**
 * 登録された route の宣言から、OpenAPI の文書を作る。hnk の本体は OpenAPI を知らないので、
 * 要る人だけが使う部品。JSON Schema への変換は、スキーマのライブラリ自身が持つ（Standard JSON Schema）
 */
import type { Hono } from "hono";
import { ROUTE } from "./router";
import type { AnySchema, RouteConfig } from "./route-types";
import type { JsonSchemaCapable } from "./standard-schema";

const TARGET = "draft-2020-12";

const jsonSchemaOf = (schema: AnySchema, io: "input" | "output") => {
  const converter = (schema as unknown as JsonSchemaCapable)["~standard"].jsonSchema;
  if (!converter)
    throw new Error(
      `この schema（${schema["~standard"].vendor}）は JSON Schema を出せない。OpenAPI の文書には、Standard JSON Schema を満たすものを使う`,
    );

  // 日付のように JSON Schema で表せない型は、文書では「何でも」にして、文書の生成そのものは止めない
  return converter[io]({ target: TARGET, libraryOptions: { unrepresentable: "any" } });
};

/** `/users/:id` → `/users/{id}` */
const openapiPath = (path: string) => path.replace(/:([A-Za-z0-9_]+)(\{[^}]*\})?/g, "{$1}");

const parametersOf = (schema: AnySchema, where: "path" | "query" | "header" | "cookie") => {
  const object = jsonSchemaOf(schema, "input") as {
    properties?: Record<string, unknown>;
    required?: string[];
  };

  return Object.entries(object.properties ?? {}).map(([name, property]) => ({
    name,
    in: where,
    required: where === "path" || (object.required ?? []).includes(name),
    schema: property,
  }));
};

const contentOf = (content: NonNullable<RouteConfig["responses"][number]["content"]>, io: "input" | "output") =>
  Object.fromEntries(
    Object.entries(content).map(([type, { schema }]) => [type, { schema: jsonSchemaOf(schema, io) }]),
  );

const operationOf = (route: RouteConfig) => {
  const { params, query, headers, cookies, body } = route.request ?? {};

  return {
    parameters: [
      ...(params ? parametersOf(params, "path") : []),
      ...(query ? parametersOf(query, "query") : []),
      ...(headers ? parametersOf(headers, "header") : []),
      ...(cookies ? parametersOf(cookies, "cookie") : []),
    ],
    ...(body && {
      requestBody: { required: body.required ?? false, content: contentOf(body.content, "input") },
    }),
    responses: Object.fromEntries(
      Object.entries(route.responses).map(([status, response]) => [
        status,
        {
          description: response.description,
          ...(response.content && { content: contentOf(response.content, "output") }),
        },
      ]),
    ),
  };
};

/** app に登録された route から文書を作る。`app.get("/openapi.json", (c) => c.json(openapiDocument(app, info)))` */
export const openapiDocument = (app: Hono<any, any, any>, info: { title: string; version: string }) => {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const registered of app.routes) {
    const route = (registered.handler as unknown as { [ROUTE]?: RouteConfig })[ROUTE];
    if (!route) continue;

    const path = openapiPath(registered.path);
    (paths[path] ??= {})[route.method] = operationOf(route);
  }

  return { openapi: "3.1.0", info, paths };
};
