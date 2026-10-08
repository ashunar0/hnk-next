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
import { createRouter, defineEndpoint, errorResponses, json, jsonBody } from "../../lib/openapi";
import { requireAuth } from "../../middleware/auth";
import { invoiceResponse, listInvoicesResponse } from "./presenter";

const endpoint = defineEndpoint<AppEnv>();

export const invoicesRoute = createRouter<AppEnv>()
  // 一覧
  .openapi(
    ...endpoint(
      createRoute({
        method: "get",
        path: "/",
        middleware: [requireAuth] as const,
        responses: {
          200: json(listInvoicesResponseSchema, "自分の請求書の一覧"),
          ...errorResponses("UNAUTHORIZED"),
        },
      }),
      async (c, reply) => {
        const viewerId = c.get("authUserId");
        const { invoices } = deps(c);

        const rows = await invoices.listMine(viewerId);

        return reply(200, listInvoicesResponse(rows));
      },
    ),
  )
  // 1件
  .openapi(
    ...endpoint(
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
      async (c, reply) => {
        const { id } = c.req.valid("param");
        const viewerId = c.get("authUserId");
        const { invoices } = deps(c);

        const result = await invoices.get(id, viewerId);
        if (!result.ok) return reply.failure(result.error);

        return reply(200, invoiceResponse(result.value));
      },
    ),
  )
  // 作成
  .openapi(
    ...endpoint(
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
      async (c, reply) => {
        const input = c.req.valid("json");
        const viewerId = c.get("authUserId");
        const { invoices } = deps(c);

        const row = await invoices.create(viewerId, input);

        return reply(200, invoiceResponse(row));
      },
    ),
  )
  // 更新
  .openapi(
    ...endpoint(
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
      async (c, reply) => {
        const { id } = c.req.valid("param");
        const input = c.req.valid("json");
        const viewerId = c.get("authUserId");
        const { invoices } = deps(c);

        const result = await invoices.update(id, viewerId, input);
        if (!result.ok) return reply.failure(result.error);

        return reply(200, invoiceResponse(result.value));
      },
    ),
  )
  // 削除
  .openapi(
    ...endpoint(
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
      async (c, reply) => {
        const { id } = c.req.valid("param");
        const viewerId = c.get("authUserId");
        const { invoices } = deps(c);

        const result = await invoices.remove(id, viewerId);
        if (!result.ok) return reply.failure(result.error);

        return reply(200, { ok: true });
      },
    ),
  );
