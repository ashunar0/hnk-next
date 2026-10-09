import { createEndpoint, errorResponses, json } from "hnk";
import { z } from "zod";
import { NotFound } from "./errors";
import { allowAnonymous } from "./middleware/auth";

const ok = json(z.object({ ok: z.literal(true) }), "ok");

// 宣言した失敗は返せる
export const declared = createEndpoint(
  {
    method: "get",
    path: "/a",
    middleware: [allowAnonymous],
    responses: { 200: ok, ...errorResponses(NotFound) },
  },
  async (_c, reply) => reply.failure("NOT_FOUND"),
);

// 失敗を何も宣言していない route では、赤線の文言が「宣言が無い。errorResponses を足す」になる
export const none = createEndpoint(
  { method: "get", path: "/b", middleware: [allowAnonymous], responses: { 200: ok } },
  // @ts-expect-error 失敗の宣言が無い
  async (_c, reply) => reply.failure("NOT_FOUND"),
);

// 一部だけ宣言している route では、宣言していないコードは通らない
export const some = createEndpoint(
  {
    method: "get",
    path: "/c",
    middleware: [allowAnonymous],
    responses: { 200: ok, ...errorResponses(NotFound) },
  },
  // @ts-expect-error FORBIDDEN は宣言していない
  async (_c, reply) => reply.failure("FORBIDDEN"),
);
