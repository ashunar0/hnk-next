/**
 * hnk は検証のライブラリを決め打ちしない。valibot で書いた route が、zod と同じに動くこと：
 * 入力の検査、型、OpenAPI の文書。
 * valibot 自身は JSON Schema を出さないので、文書に出したい schema だけ toStandardJsonSchema で包む
 */
import { toStandardJsonSchema } from "@valibot/to-json-schema";
import { createEndpoint, createRouter, errorResponses, json, jsonBody, onError, provideDeps } from "hnk";
import { openapiDocument } from "hnk/openapi";
import * as v from "valibot";
import { expect, it } from "vitest";
import { NotFound } from "../api/errors";
import { allowAnonymous } from "../api/middleware/auth";

const params = toStandardJsonSchema(v.object({ id: v.pipe(v.string(), v.minLength(2)) }));
const query = toStandardJsonSchema(
  v.object({ limit: v.optional(v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)), "10") }),
);
const input = toStandardJsonSchema(v.object({ title: v.pipe(v.string(), v.minLength(1)) }));
const output = toStandardJsonSchema(v.object({ id: v.string(), title: v.string(), limit: v.number() }));

const router = createRouter().openapi(
  ...createEndpoint(
    {
      method: "post",
      path: "/items/:id",
      middleware: [allowAnonymous],
      request: { params, query, body: jsonBody(input) },
      responses: { 200: json(output, "作った"), ...errorResponses(NotFound) },
    },
    async (c, reply) => {
      const { id } = c.req.valid("param");
      const { limit } = c.req.valid("query");
      const { title } = c.req.valid("json");
      // 型: limit は transform の後の number、title は string
      limit satisfies number;
      title satisfies string;

      if (id === "no") return reply.failure("NOT_FOUND");

      return reply(200, { id, title, limit });
    },
  ),
);

const app = createRouter()
  .use(provideDeps(() => ({}) as never))
  .route("/", router)
  .onError(onError);

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

it("valibot で書いた route が動く（検査を通ると transform の後の値が handler に届く）", async () => {
  const res = await post("/items/abc?limit=5", { title: "t" });

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ id: "abc", title: "t", limit: 5 });
});

it("入力の検査に失敗すると 400 VALIDATION_ERROR（params・query・body のどれでも）", async () => {
  for (const [path, body] of [
    ["/items/a", { title: "t" }],
    ["/items/abc?limit=0", { title: "t" }],
    ["/items/abc", { title: "" }],
  ] as const) {
    const res = await post(path, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  }
});

it("宣言した失敗を reply.failure で返せる", async () => {
  const res = await post("/items/no", { title: "t" });

  expect(res.status).toBe(404);
  expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});

it("OpenAPI の文書に、valibot の schema が出る", () => {
  const doc = openapiDocument(app, { title: "t", version: "0" }) as any;
  const op = doc.paths["/items/{id}"].post;

  expect(op.parameters.map((p: { name: string; in: string }) => `${p.in}:${p.name}`)).toEqual(["path:id", "query:limit"]);
  expect(op.requestBody.content["application/json"].schema.properties.title.type).toBe("string");
  expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(["200", "400", "404"]));
});
