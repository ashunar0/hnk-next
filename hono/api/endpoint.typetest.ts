import { createEndpoint, json } from "hnk";
import { z } from "zod";
import { allowAnonymous } from "./middleware/auth";

const ok = json(z.object({ ok: z.literal(true) }), "ok");

// path の :id と params の id が合っていれば通る
export const matched = createEndpoint(
  {
    method: "get",
    path: "/users/:id",
    middleware: [allowAnonymous],
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: ok },
  },
  async (c, reply) => {
    c.req.valid("param").id satisfies string;

    return reply(200, { ok: true });
  },
);

// path は :userId なのに params は id。実行時は常に検査が失敗するので、型で止める
export const mismatched = createEndpoint(
  // @ts-expect-error path のパラメータと request.params のキーが合っていない
  {
    method: "get",
    path: "/users/:userId",
    middleware: [allowAnonymous],
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: ok },
  },
  async (_c, reply) => reply(200, { ok: true }),
);
