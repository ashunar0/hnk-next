import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { makeDeps } from "../api/deps";
import { buildApp } from "../api/index";

const app = buildApp(makeDeps);

it("OpenAPI の文書が作れる（query に zod の transform を含んでいても）", async () => {
  const res = await app.request("/openapi.json", {}, env);

  expect(res.status).toBe(200);
  const doc = (await res.json()) as { paths: Record<string, unknown> };
  expect(Object.keys(doc.paths)).toContain("/invoices");
});

it("ログインしていなければ 401", async () => {
  const res = await app.request("/invoices", {}, env);

  expect(res.status).toBe(401);
});
