/**
 * hnk は検証のライブラリを決め打ちしない。valibot で書いた route が、zod と同じに動くこと：
 * 入力の検査、型、OpenAPI の文書。
 * valibot 自身は JSON Schema を出さないので、文書に出したい schema だけ toStandardJsonSchema で包む
 */
import { toStandardJsonSchema } from "@valibot/to-json-schema";
import {
  createRouter,
  errorResponses,
  onError,
  pageQuerySchema,
  pageResponse,
  pageResponseSchema,
  provideDeps,
  NotFound,
} from "hnk";
import { openapiDocument } from "hnk/openapi";
import * as v from "valibot";
import { expect, it } from "vitest";
import { allowAnonymous } from "../api/middleware/auth";

const params = toStandardJsonSchema(v.object({ id: v.pipe(v.string(), v.minLength(2)) }));
const query = toStandardJsonSchema(
  v.object({
    limit: v.optional(v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)), "10"),
  }),
);
const input = toStandardJsonSchema(v.object({ title: v.pipe(v.string(), v.minLength(1)) }));
const output = toStandardJsonSchema(
  v.object({ id: v.string(), title: v.string(), limit: v.number() }),
);

const item = toStandardJsonSchema(v.object({ name: v.string() }));

const router = createRouter()
  .endpoint(
    {
      method: "post",
      path: "/items/:id",
      middleware: [allowAnonymous],
      request: { param: params, query, json: input },
      responses: { 200: output, ...errorResponses(NotFound) },
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
  )
  // hnk のページ送りの部品は、valibot の絞り込みと 1 件の形も包める
  .endpoint(
    {
      method: "get",
      path: "/items",
      middleware: [allowAnonymous],
      request: {
        query: pageQuerySchema(toStandardJsonSchema(v.object({ q: v.optional(v.string()) }))),
      },
      responses: { 200: pageResponseSchema(item) },
    },
    async (c, reply) => {
      const { q, cursor, limit } = c.req.valid("query");
      q satisfies string | undefined;
      const items = Array.from({ length: limit }, (_, i) => ({ name: `${q ?? "item"}${i}` }));

      return reply(
        200,
        pageResponse({ items, next: cursor ?? null }, (x) => x),
      );
    },
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

  expect(op.parameters.map((p: { name: string; in: string }) => `${p.in}:${p.name}`)).toEqual([
    "path:id",
    "query:limit",
  ]);
  expect(op.requestBody.content["application/json"].schema.properties.title.type).toBe("string");
  expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(["200", "400", "404"]));
});

it("ページ送りの部品は、valibot の絞り込みを包み、limit の既定と上限を持つ", async () => {
  const ok = await app.request("/items?q=a&limit=2");
  expect(await ok.json()).toEqual({ items: [{ name: "a0" }, { name: "a1" }], nextCursor: null });

  const fallback = await app.request("/items");
  expect(((await fallback.json()) as { items: unknown[] }).items).toHaveLength(20);

  for (const bad of ["/items?limit=0", "/items?limit=101", "/items?limit=x", "/items?cursor=@@"]) {
    const res = await app.request(bad);
    expect(res.status).toBe(400);
  }
});

it("OpenAPI の文書に、ページ送りの query と応答が出る", () => {
  const doc = openapiDocument(app, { title: "t", version: "0" }) as any;
  const op = doc.paths["/items"].get;

  expect(op.parameters.map((p: { name: string }) => p.name)).toEqual(["q", "cursor", "limit"]);
  expect(
    op.responses["200"].content["application/json"].schema.properties.items.items.properties.name
      .type,
  ).toBe("string");
});
