/**
 * 同じ番号の失敗を 2 つ宣言しても、どちらも返せること。
 * 宣言の中で番号がぶつかると片方が消え、型は通るのに実行時に 500 になっていた
 */
import { createEndpoint, createRouter, errorResponses, httpError, json, provideDeps } from "hnk";
import { z } from "zod";
import { expect, it } from "vitest";
import { allowAnonymous } from "../api/middleware/auth";

const First = httpError("FIRST", 409, "1 つ目の失敗");
const Second = httpError("SECOND", 409, "2 つ目の失敗");

const app = createRouter();
app.use(provideDeps(() => ({}) as never));
app.openapi(
  ...createEndpoint(
    {
      method: "get",
      path: "/{which}",
      middleware: [allowAnonymous] as const,
      request: { params: z.object({ which: z.enum(["first", "second"]) }) },
      responses: {
        200: json(z.object({ ok: z.literal(true) }), "成功"),
        ...errorResponses(First, Second),
      },
    },
    async (c, reply) => {
      const { which } = c.req.valid("param");

      return which === "first" ? reply.failure("FIRST") : reply.failure("SECOND");
    },
  ),
);

it.each([
  ["first", "FIRST", "1 つ目の失敗"],
  ["second", "SECOND", "2 つ目の失敗"],
])("409 の %s を、自分のコードと文言で返す", async (which, code, message) => {
  const res = await app.request(`/${which}`);

  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: { code, message } });
});
