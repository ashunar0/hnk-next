import { expect, it } from "vitest";
import { alice, request } from "./fixtures";

it("OpenAPI の文書が返る", async () => {
  const res = await request(alice, "GET", "/openapi.json");

  expect(res.status).toBe(200);
});
