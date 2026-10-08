/**
 * invoices を HTTP で公開する。入出力の形と、モノ → 応答の変換もここに置く
 */
import { createEndpoint, createRoute, createRouter, errorResponses, json, jsonBody } from "hnk";
import { z } from "zod";
import { Forbidden, NotDraft, NotFound } from "../../errors";
import { requireAuth } from "../../middleware/auth";
import { invoiceInputSchema, invoiceStatuses, type Invoice } from "./domain";

// 受け取る形。本文の入力は domain の invoiceInputSchema
const invoiceParamsSchema = z.object({
  id: z.string(),
});

/** 一覧の位置を、外からは中身の読めない文字列にする */
const encodeCursor = (cursor: Pick<Invoice, "updatedAt" | "id">) =>
  btoa(`${cursor.updatedAt.getTime()}:${cursor.id}`);

const cursorSchema = z.string().transform((value, ctx) => {
  const decoded = (() => {
    try {
      return atob(value);
    } catch {
      return "";
    }
  })();
  const at = decoded.indexOf(":");
  const ms = Number(decoded.slice(0, at));
  const id = decoded.slice(at + 1);
  if (at < 0 || !Number.isInteger(ms) || id === "") {
    ctx.addIssue({ code: "custom", message: "cursor が正しくありません" });
    return z.NEVER;
  }

  return { updatedAt: new Date(ms), id };
});

const listInvoicesQuerySchema = z.object({
  status: z.enum(invoiceStatuses).optional(),
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// 返す形
const invoiceResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  amount: z.number(),
  customerEmail: z.string(),
  dueAt: z.number(),
  status: z.enum(invoiceStatuses),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const listInvoicesResponseSchema = z.object({
  items: z.array(invoiceResponseSchema),
  /** 続きを読むときに cursor に渡す。続きが無ければ null */
  nextCursor: z.string().nullable(),
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
    amount: invoice.amount,
    customerEmail: invoice.customerEmail,
    dueAt: invoice.dueAt.getTime(),
    status: invoice.status,
    createdAt: invoice.createdAt.getTime(),
    updatedAt: invoice.updatedAt.getTime(),
  };
}

function listInvoicesResponse(page: {
  items: Invoice[];
  next: Pick<Invoice, "updatedAt" | "id"> | null;
}): ListInvoicesResponse {
  return {
    items: page.items.map(invoiceResponse),
    nextCursor: page.next ? encodeCursor(page.next) : null,
  };
}

export const invoicesRouter = createRouter()
  // 一覧
  .openapi(
    ...createEndpoint(
      createRoute({
        method: "get",
        path: "/",
        middleware: [requireAuth] as const,
        request: { query: listInvoicesQuerySchema },
        responses: {
          200: json(listInvoicesResponseSchema, "触れる範囲の請求書の一覧"),
        },
      }),
      async (c, reply, { invoices }) => {
        const { status, cursor, limit } = c.req.valid("query");
        const viewer = c.get("authViewer");

        const page = await invoices.list(viewer, { status, after: cursor, limit });

        return reply(200, listInvoicesResponse(page));
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
        const viewer = c.get("authViewer");

        const result = await invoices.get(id, viewer);
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
        const viewer = c.get("authViewer");

        const row = await invoices.create(viewer, input);

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
        const viewer = c.get("authViewer");

        const result = await invoices.update(id, viewer, input);
        if (!result.ok) return reply.failure(result.error);

        return reply(200, invoiceResponse(result.value));
      },
    ),
  )
  // 送付
  .openapi(
    ...createEndpoint(
      createRoute({
        method: "post",
        path: "/{id}/send",
        middleware: [requireAuth] as const,
        request: { params: invoiceParamsSchema },
        responses: {
          200: json(invoiceResponseSchema, "送付した請求書"),
          ...errorResponses(NotFound, Forbidden, NotDraft),
        },
      }),
      async (c, reply, { invoices }) => {
        const { id } = c.req.valid("param");
        const viewer = c.get("authViewer");

        const result = await invoices.send(id, viewer);
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
        const viewer = c.get("authViewer");

        const result = await invoices.remove(id, viewer);
        if (!result.ok) return reply.failure(result.error);

        return reply(200, { ok: true });
      },
    ),
  );
