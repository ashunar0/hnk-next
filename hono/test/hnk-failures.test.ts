/**
 * 同じ番号の失敗を 2 つ宣言しても、どちらも返せること。
 * 宣言の中で番号がぶつかると片方が消え、型は通るのに実行時に 500 になっていた
 */
import { createRouter, errorResponses, httpError, provideDeps } from "hnk";
import { z } from "zod";
import { expect, it } from "vitest";
import { allowAnonymous } from "../api/middleware/auth";

const First = httpError("FIRST", 409, "1 つ目の失敗");
const Second = httpError("SECOND", 409, "2 つ目の失敗");

const app = createRouter();
app.use(provideDeps(() => ({}) as never));
app.endpoint(
  {
    method: "get",
    path: "/:which",
    middleware: [allowAnonymous] as const,
    request: { param: z.object({ which: z.enum(["first", "second"]) }) },
    responses: {
      200: z.object({ ok: z.literal(true) }),
      ...errorResponses(First, Second),
    },
  },
  async (c, reply) => {
    const { which } = c.req.valid("param");

    return which === "first" ? reply.failure("FIRST") : reply.failure("SECOND");
  },
);

it.each([
  ["first", "FIRST", "1 つ目の失敗"],
  ["second", "SECOND", "2 つ目の失敗"],
])("409 の %s を、自分のコードと文言で返す", async (which, code, message) => {
  const res = await app.request(`/${which}`);

  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: { code, message } });
});

it("domain の Failure は、種類から決まった番号と、自分のコードと文言で返る", async () => {
  const Stale = { code: "STALE", kind: "conflict", message: "古い" } as const;
  const failing = createRouter();
  failing.use(provideDeps(() => ({}) as never));
  failing.endpoint(
    {
      method: "get",
      path: "/",
      middleware: [allowAnonymous] as const,
      responses: { 200: z.object({ ok: z.literal(true) }), ...errorResponses(Stale) },
    },
    async (_c, reply) => reply.failure("STALE"),
  );

  const res = await failing.request("/");

  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: { code: "STALE", message: "古い" } });
});
