import { createRouter, errorResponses, NotFound } from "hnk";
import { z } from "zod";
import { allowAnonymous } from "./middleware/auth";

const ok = z.object({ ok: z.literal(true) });

// 宣言した失敗は返せる
export const declared = createRouter().endpoint(
  {
    method: "get",
    path: "/a",
    middleware: [allowAnonymous],
    responses: { 200: ok, ...errorResponses(NotFound) },
  },
  async (_c, reply) => reply.failure("NOT_FOUND"),
);

// 失敗を何も宣言していない route では、赤線の文言が「宣言が無い。errorResponses を足す」になる
export const none = createRouter().endpoint(
  { method: "get", path: "/b", middleware: [allowAnonymous], responses: { 200: ok } },
  // @ts-expect-error 失敗の宣言が無い
  async (_c, reply) => reply.failure("NOT_FOUND"),
);

// 一部だけ宣言している route では、宣言していないコードは通らない
export const some = createRouter().endpoint(
  {
    method: "get",
    path: "/c",
    middleware: [allowAnonymous],
    responses: { 200: ok, ...errorResponses(NotFound) },
  },
  // @ts-expect-error FORBIDDEN は宣言していない
  async (_c, reply) => reply.failure("FORBIDDEN"),
);
