/**
 * invoices を HTTP で公開する。入出力の形と、モノ → 応答の変換もここに置く
 */
import { createEndpoint, createRoute, createRouter, errorResponses, json, jsonBody } from "hnk";
import { z } from "zod";
import { NotFound } from "../../errors";
import { requireAuth } from "../../middleware/auth";
import { invoiceInputSchema, type Invoice } from "./domain";

// 受け取る形。本文の入力は domain の invoiceInputSchema
const invoiceParamsSchema = z.object({
  id: z.string(),
});

// 返す形
const invoiceResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const listInvoicesResponseSchema = z.object({
  items: z.array(invoiceResponseSchema),
});

const deleteInvoiceResponseSchema = z.object({
  ok: z.literal(true),
});

type InvoiceResponse = z.infer<typeof invoiceResponseSchema>;
type ListInvoicesResponse = z.infer<typeof listInvoicesResponseSchema>;

// モノ → 応答。モノをそのまま返さず、見せる形に詰め替える
function invoiceResponse(invoice: Invoice): InvoiceResponse {
  return {
    id: invoice.id,
    title: invoice.title,
    body: invoice.body,
    createdAt: invoice.createdAt.getTime(),
    updatedAt: invoice.updatedAt.getTime(),
  };
}

function listInvoicesResponse(invoices: Invoice[]): ListInvoicesResponse {
  return { items: invoices.map(invoiceResponse) };
}

export const invoicesRouter = createRouter()
  // 一覧
  .openapi(
    ...createEndpoint(
      createRoute({
        method: "get",
        path: "/",
        middleware: [requireAuth] as const,
        responses: {
          200: json(listInvoicesResponseSchema, "自分の請求書の一覧"),
        },
      }),
      async (c, reply, { invoices }) => {
        const viewerId = c.get("authUserId");

        const mine = await invoices.listMine(viewerId);

        return reply(200, listInvoicesResponse(mine));
      },
    ),
  )
  // 1件
  .openapi(
    ...createEndpoint(
      createRoute({
        method: "get",
        path: "/{id}",
        middleware: [requireAuth] as const,
        request: { params: invoiceParamsSchema },
        responses: {
          200: json(invoiceResponseSchema, "請求書"),
          ...errorResponses(NotFound),
        },
      }),
      async (c, reply, { invoices }) => {
        const { id } = c.req.valid("param");
        const viewerId = c.get("authUserId");

        const result = await invoices.get(id, viewerId);
        if (!result.ok) return reply.failure(result.error);

        return reply(200, invoiceResponse(result.value));
      },
    ),
  )
  // 作成
  .openapi(
    ...createEndpoint(
      createRoute({
        method: "post",
        path: "/",
        middleware: [requireAuth] as const,
        request: { body: jsonBody(invoiceInputSchema) },
        responses: {
          200: json(invoiceResponseSchema, "作成した請求書"),
        },
      }),
      async (c, reply, { invoices }) => {
        const input = c.req.valid("json");
        const viewerId = c.get("authUserId");

        const row = await invoices.create(viewerId, input);

        return reply(200, invoiceResponse(row));
      },
    ),
  )
  // 更新
  .openapi(
    ...createEndpoint(
      createRoute({
        method: "put",
        path: "/{id}",
        middleware: [requireAuth] as const,
        request: { params: invoiceParamsSchema, body: jsonBody(invoiceInputSchema) },
        responses: {
          200: json(invoiceResponseSchema, "更新した請求書"),
          ...errorResponses(NotFound),
        },
      }),
      async (c, reply, { invoices }) => {
        const { id } = c.req.valid("param");
        const input = c.req.valid("json");
        const viewerId = c.get("authUserId");

        const result = await invoices.update(id, viewerId, input);
        if (!result.ok) return reply.failure(result.error);

        return reply(200, invoiceResponse(result.value));
      },
    ),
  )
  // 削除
  .openapi(
    ...createEndpoint(
      createRoute({
        method: "delete",
        path: "/{id}",
        middleware: [requireAuth] as const,
        request: { params: invoiceParamsSchema },
        responses: {
          200: json(deleteInvoiceResponseSchema, "削除した"),
          ...errorResponses(NotFound),
        },
      }),
      async (c, reply, { invoices }) => {
        const { id } = c.req.valid("param");
        const viewerId = c.get("authUserId");

        const result = await invoices.remove(id, viewerId);
        if (!result.ok) return reply.failure(result.error);

        return reply(200, { ok: true });
      },
    ),
  );
