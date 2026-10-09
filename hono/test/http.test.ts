import { env } from "cloudflare:workers";
import { systemActor } from "hnk/testing";
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

it("OpenAPI の文書: 日付は日時の文字列で出て、各 schema に $schema が付かない", async () => {
  const res = await app.request("/openapi.json", {}, env);

  const doc = (await res.json()) as {
    paths: Record<
      string,
      Record<
        string,
        { requestBody: { content: Record<string, { schema: Record<string, unknown> }> } }
      >
    >;
  };
  const schema = doc.paths["/invoices/{id}"]!.put!.requestBody.content["application/json"]!.schema;

  expect(schema).not.toHaveProperty("$schema");
  expect((schema.properties as Record<string, unknown>).dueAt).toEqual({
    type: "string",
    format: "date-time",
  });
});

it("ログインしていなければ 401", async () => {
  const res = await app.request("/invoices", {}, env);

  expect(res.status).toBe(401);
});

it("webhook は allowSystem で、署名を確かめた後の handler にシステムを渡す", async () => {
  const received: unknown[] = [];
  const fakeApp = buildApp(
    () =>
      ({
        payments: {
          async verifyEvent() {
            return {
              ok: true,
              value: { providerRef: "cs_x", outcome: "succeeded", at: new Date() },
            };
          },
          async receive(system: unknown) {
            received.push(system);
            return { ok: true, value: undefined };
          },
        },
      }) as never,
  );

  const res = await fakeApp.request("/webhooks/stripe", { method: "POST", body: "{}" }, env);

  expect(res.status).toBe(200);
  expect(received).toEqual([systemActor]);
});
