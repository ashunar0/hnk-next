import { createRouter } from "hnk";
import { z } from "zod";
import { allowAnonymous } from "./middleware/auth";

const ok = z.object({ ok: z.literal(true) });

// path の :id と param の id が合っていれば通る
export const matched = createRouter().endpoint(
  {
    method: "get",
    path: "/users/:id",
    middleware: [allowAnonymous],
    request: { param: z.object({ id: z.string() }) },
    responses: { 200: ok },
  },
  async (c, reply) => {
    c.req.valid("param").id satisfies string;

    return reply(200, { ok: true });
  },
);

// path は :userId なのに param は id。実行時は常に検査が失敗するので、型で止める
export const mismatched = createRouter().endpoint(
  // @ts-expect-error path のパラメータと request.param のキーが合っていない
  {
    method: "get",
    path: "/users/:userId",
    middleware: [allowAnonymous],
    request: { param: z.object({ id: z.string() }) },
    responses: { 200: ok },
  },
  async (_c, reply) => reply(200, { ok: true }),
);

// 宣言していない入力は読めない（json を宣言していないのに valid("json") を呼ぶ）
export const undeclared = createRouter().endpoint(
  {
    method: "get",
    path: "/x",
    middleware: [allowAnonymous],
    responses: { 200: ok },
  },
  async (c, reply) => {
    // @ts-expect-error json を宣言していない
    c.req.valid("json");

    return reply(200, { ok: true });
  },
);
