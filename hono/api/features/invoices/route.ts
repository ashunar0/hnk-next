import { createRoute } from "@hono/zod-openapi";
import {
  createInvoiceInputSchema,
  deleteInvoiceResponseSchema,
  invoiceParamsSchema,
  invoiceResponseSchema,
  listInvoicesResponseSchema,
  updateInvoiceInputSchema,
} from "@contract/invoices/schema";
import { deps } from "../../deps";
import type { AppEnv } from "../../env";
import { failure } from "../../lib/errors";
import { createRouter, errorResponses, json, jsonBody } from "../../lib/openapi";
import { requireAuth } from "../../middleware/auth";
import { invoiceResponse, listInvoicesResponse } from "./presenter";

export const invoicesRoute = createRouter<AppEnv>()
  // 一覧
  .openapi(
    createRoute({
      method: "get",
      path: "/",
      middleware: [requireAuth] as const,
      responses: {
        200: json(listInvoicesResponseSchema, "自分の請求書の一覧"),
        ...errorResponses("UNAUTHORIZED"),
      },
    }),
    async (c) => {
      const viewerId = c.get("authUserId");
      const { invoices } = deps(c);

      const rows = await invoices.listMine(viewerId);

      return c.json(listInvoicesResponse(rows), 200);
    },
  )
  // 1件
  .openapi(
    createRoute({
      method: "get",
      path: "/{id}",
      middleware: [requireAuth] as const,
      request: { params: invoiceParamsSchema },
      responses: {
        200: json(invoiceResponseSchema, "請求書"),
        ...errorResponses("VALIDATION_ERROR", "UNAUTHORIZED", "NOT_FOUND"),
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const viewerId = c.get("authUserId");
      const { invoices } = deps(c);

      const result = await invoices.get(id, viewerId);
      if (!result.ok) return failure(c, result.error);

      return c.json(invoiceResponse(result.value), 200);
    },
  )
  // 作成
  .openapi(
    createRoute({
      method: "post",
      path: "/",
      middleware: [requireAuth] as const,
      request: { body: jsonBody(createInvoiceInputSchema) },
      responses: {
        200: json(invoiceResponseSchema, "作成した請求書"),
        ...errorResponses("VALIDATION_ERROR", "UNAUTHORIZED"),
      },
    }),
    async (c) => {
      const input = c.req.valid("json");
      const viewerId = c.get("authUserId");
      const { invoices } = deps(c);

      const row = await invoices.create(viewerId, input);

      return c.json(invoiceResponse(row), 200);
    },
  )
  // 更新
  .openapi(
    createRoute({
      method: "put",
      path: "/{id}",
      middleware: [requireAuth] as const,
      request: { params: invoiceParamsSchema, body: jsonBody(updateInvoiceInputSchema) },
      responses: {
        200: json(invoiceResponseSchema, "更新した請求書"),
        ...errorResponses("VALIDATION_ERROR", "UNAUTHORIZED", "NOT_FOUND", "NOT_OWNER"),
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const viewerId = c.get("authUserId");
      const { invoices } = deps(c);

      const result = await invoices.update(id, viewerId, input);
      if (!result.ok) return failure(c, result.error);

      return c.json(invoiceResponse(result.value), 200);
    },
  )
  // 削除
  .openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      middleware: [requireAuth] as const,
      request: { params: invoiceParamsSchema },
      responses: {
        200: json(deleteInvoiceResponseSchema, "削除した"),
        ...errorResponses("VALIDATION_ERROR", "UNAUTHORIZED", "NOT_FOUND", "NOT_OWNER"),
      },
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      const viewerId = c.get("authUserId");
      const { invoices } = deps(c);

      const result = await invoices.remove(id, viewerId);
      if (!result.ok) return failure(c, result.error);

      return c.json({ ok: true as const }, 200);
    },
  );
