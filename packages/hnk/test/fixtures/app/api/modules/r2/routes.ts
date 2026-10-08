// expect: hnk(route-replies-through-reply) | c.json() ではなく reply で返す
import { createRouter } from "hnk";

export const r2Router = createRouter();

const handler = (c: { json: (b: unknown) => unknown }) => c.json({ ok: true });
void handler;
