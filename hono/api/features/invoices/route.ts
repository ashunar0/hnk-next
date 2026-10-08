import { Hono } from "hono";
import { createInvoiceInputSchema, updateInvoiceInputSchema } from "@contract/invoices/schema";
import { deps } from "../../deps";
import type { AppEnv } from "../../env";
import { validateBody } from "../../lib/validator";
import { requireAuth } from "../../middleware/auth";
import { invoiceResponse, listInvoicesResponse } from "./presenter";

export const invoicesRoute = new Hono<AppEnv>()
  // 一覧
  .get("/", requireAuth, async (c) => {
    const viewerId = c.get("authUserId");
    const { invoices } = deps(c);

    const rows = await invoices.listMine(viewerId);

    return c.json(listInvoicesResponse(rows));
  })
  // 1件
  .get("/:id", requireAuth, async (c) => {
    const id = c.req.param("id");
    const viewerId = c.get("authUserId");
    const { invoices } = deps(c);

    const row = await invoices.get(id, viewerId);

    return c.json(invoiceResponse(row));
  })
  // 作成
  .post("/", requireAuth, validateBody(createInvoiceInputSchema), async (c) => {
    const input = c.req.valid("json");
    const viewerId = c.get("authUserId");
    const { invoices } = deps(c);

    const row = await invoices.create(viewerId, input);

    return c.json(invoiceResponse(row));
  })
  // 更新
  .put("/:id", requireAuth, validateBody(updateInvoiceInputSchema), async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");
    const viewerId = c.get("authUserId");
    const { invoices } = deps(c);

    const row = await invoices.update(id, viewerId, input);

    return c.json(invoiceResponse(row));
  })
  // 削除
  .delete("/:id", requireAuth, async (c) => {
    const id = c.req.param("id");
    const viewerId = c.get("authUserId");
    const { invoices } = deps(c);

    await invoices.remove(id, viewerId);

    return c.json({ ok: true });
  });
