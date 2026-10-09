/**
 * 登録された route の宣言から、OpenAPI の文書を作る。hnk の本体は OpenAPI を知らないので、
 * 要る人だけが使う部品。JSON Schema への変換は、スキーマのライブラリ自身が持つ（Standard JSON Schema）
 */
import type { Hono } from "hono";
import { ROUTE } from "./router";
import type { AnySchema, ResponseEntry, RouteConfig } from "./route-types";
import { toJsonSchema } from "./standard-schema";

const TARGET = "draft-2020-12";

/** 文書を作るときの指定。libraryOptions は、スキーマのライブラリ固有の指定をそのまま渡す口 */
export type OpenapiOptions = { libraryOptions?: Record<string, unknown> };

type Io = "input" | "output";

const jsonSchemaOf = (schema: AnySchema, io: Io, options: OpenapiOptions) =>
  // 表せない型は、文書では「何でも」にして、文書の生成そのものは止めない。指定があればそちらが先
  toJsonSchema(schema, io, {
    target: TARGET,
    libraryOptions: { unrepresentable: "any", ...options.libraryOptions },
  });

/** `/users/:id` → `/users/{id}` */
const openapiPath = (path: string) =>
  path.replace(/:([A-Za-z0-9_]+)(\{[^}]*\})?/g, "{$1}");

const parametersOf = (
  schema: AnySchema,
  where: "path" | "query" | "header" | "cookie",
  options: OpenapiOptions,
) => {
  const object = jsonSchemaOf(schema, "input", options) as {
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

const jsonContent = (schema: AnySchema, io: Io, options: OpenapiOptions) => ({
  "application/json": { schema: jsonSchemaOf(schema, io, options) },
});

/** 応答の宣言から、スキーマと説明を取り出す（スキーマだけなら説明は空） */
const responseOf = (entry: ResponseEntry) =>
  "~standard" in entry ? { schema: entry, description: "" } : entry;

const operationOf = (route: RouteConfig, options: OpenapiOptions) => {
  const { param, query, header, cookie, json } = route.request ?? {};

  return {
    parameters: [
      ...(param ? parametersOf(param, "path", options) : []),
      ...(query ? parametersOf(query, "query", options) : []),
      ...(header ? parametersOf(header, "header", options) : []),
      ...(cookie ? parametersOf(cookie, "cookie", options) : []),
    ],
    ...(json && {
      requestBody: {
        required: true,
        content: jsonContent(json, "input", options),
      },
    }),
    responses: Object.fromEntries(
      Object.entries(route.responses).map(([status, entry]) => {
        const { schema, description } = responseOf(entry);

        return [
          status,
          { description, content: jsonContent(schema, "output", options) },
        ];
      }),
    ),
  };
};

/** app に登録された route から文書を作る。`app.get("/openapi.json", (c) => c.json(openapiDocument(app, info)))` */
export const openapiDocument = (
  app: Hono<any, any, any>,
  info: { title: string; version: string },
  options: OpenapiOptions = {},
) => {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const registered of app.routes) {
    const route = (registered.handler as unknown as { [ROUTE]?: RouteConfig })[
      ROUTE
    ];
    if (!route) continue;

    const path = openapiPath(registered.path);
    (paths[path] ??= {})[route.method] = operationOf(route, options);
  }

  return { openapi: "3.1.0", info, paths };
};
