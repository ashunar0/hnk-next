import { Hono } from "hono";
import { createInvoiceInputSchema, updateInvoiceInputSchema } from "@contract/invoices/schema";
import { deps } from "../../deps";
import type { AppEnv } from "../../env";
import { failure } from "../../lib/errors";
import { validateBody } from "../../lib/validator";
import { requireAuth } from "../../middleware/auth";
import { invoiceResponse, listInvoicesResponse } from "./presenter";

export const invoicesRoute = new Hono<AppEnv>()
  // 一覧
  .get("/", requireAuth, async (c) => {
    const viewerId = c.get("authUserId");
    const { invoices } = deps(c);

    const rows = await invoices.listMine(viewerId);

    return c.json(listInvoicesResponse(rows), 200);
  })
  // 1件
  .get("/:id", requireAuth, async (c) => {
    const id = c.req.param("id");
    const viewerId = c.get("authUserId");
    const { invoices } = deps(c);

    const result = await invoices.get(id, viewerId);
    if (!result.ok) return failure(c, result.error);

    return c.json(invoiceResponse(result.value), 200);
  })
  // 作成
  .post("/", requireAuth, validateBody(createInvoiceInputSchema), async (c) => {
    const input = c.req.valid("json");
    const viewerId = c.get("authUserId");
    const { invoices } = deps(c);

    const row = await invoices.create(viewerId, input);

    return c.json(invoiceResponse(row), 200);
  })
  // 更新
  .put("/:id", requireAuth, validateBody(updateInvoiceInputSchema), async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const viewerId = c.get("authUserId");
    const { invoices } = deps(c);

    const result = await invoices.update(id, viewerId, input);
    if (!result.ok) return failure(c, result.error);

    return c.json(invoiceResponse(result.value), 200);
  })
  // 削除
  .delete("/:id", requireAuth, async (c) => {
    const id = c.req.param("id");
    const viewerId = c.get("authUserId");
    const { invoices } = deps(c);

    const result = await invoices.remove(id, viewerId);
    if (!result.ok) return failure(c, result.error);

    return c.json({ ok: true }, 200);
  });
