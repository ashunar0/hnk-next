/**
 * invoices を HTTP で公開する。入出力の形と、モノ → 応答の変換もここに置く
 */
import {
  createEndpoint,
  createRouter,
  errorResponses,
  json,
  jsonBody,
  pageQuery,
  pageResponse,
  pageResponseSchema,
} from "hnk";
import { z } from "zod";
import { Forbidden, NotDraft, NotFound } from "../../errors";
import { requireAuth } from "../../middleware/auth";
import {
  invoiceIdSchema,
  invoiceInputSchema,
  invoiceStatuses,
  shareLevels,
  type Invoice,
} from "./domain";

// 受け取る形。本文の入力は domain の invoiceInputSchema
const invoiceParamsSchema = z.object({
  id: invoiceIdSchema,
});

const listInvoicesQuerySchema = z.object({
  status: z.enum(invoiceStatuses).optional(),
  ...pageQuery,
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

const listInvoicesResponseSchema = pageResponseSchema(invoiceResponseSchema);

const deleteInvoiceResponseSchema = z.object({
  ok: z.literal(true),
});

const shareInputSchema = z.object({
  /** 共有する相手 */
  userId: z.string().min(1),
  level: z.enum(shareLevels),
});

const shareParamsSchema = z.object({
  id: invoiceIdSchema,
  userId: z.string(),
});

const okResponseSchema = z.object({ ok: z.literal(true) });

type InvoiceResponse = z.infer<typeof invoiceResponseSchema>;

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

export const invoicesRouter = createRouter()
  // 一覧
  .openapi(
    ...createEndpoint(
      {
        method: "get",
        path: "/",
        middleware: [requireAuth],
        request: { query: listInvoicesQuerySchema },
        responses: {
          200: json(listInvoicesResponseSchema, "触れる範囲の請求書の一覧"),
        },
      },
      async (c, reply, { invoices }) => {
        const { status, cursor, limit } = c.req.valid("query");
        const viewer = c.get("authViewer");

        const page = await invoices.list(viewer, { status, after: cursor, limit });

        return reply(200, pageResponse(page, invoiceResponse));
      },
    ),
  )
  // 1件
  .openapi(
    ...createEndpoint(
      {
        method: "get",
        path: "/{id}",
        middleware: [requireAuth],
        request: { params: invoiceParamsSchema },
        responses: {
          200: json(invoiceResponseSchema, "請求書"),
          ...errorResponses(NotFound),
        },
      },
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
      {
        method: "post",
        path: "/",
        middleware: [requireAuth],
        request: { body: jsonBody(invoiceInputSchema) },
        responses: {
          200: json(invoiceResponseSchema, "作成した請求書"),
        },
      },
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
      {
        method: "put",
        path: "/{id}",
        middleware: [requireAuth],
        request: { params: invoiceParamsSchema, body: jsonBody(invoiceInputSchema) },
        responses: {
          200: json(invoiceResponseSchema, "更新した請求書"),
          ...errorResponses(NotFound, Forbidden),
        },
      },
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
      {
        method: "post",
        path: "/{id}/send",
        middleware: [requireAuth],
        request: { params: invoiceParamsSchema },
        responses: {
          200: json(invoiceResponseSchema, "送付した請求書"),
          ...errorResponses(NotFound, Forbidden, NotDraft),
        },
      },
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
      {
        method: "delete",
        path: "/{id}",
        middleware: [requireAuth],
        request: { params: invoiceParamsSchema },
        responses: {
          200: json(deleteInvoiceResponseSchema, "削除した"),
          ...errorResponses(NotFound, Forbidden),
        },
      },
      async (c, reply, { invoices }) => {
        const { id } = c.req.valid("param");
        const viewer = c.get("authViewer");

        const result = await invoices.remove(id, viewer);
        if (!result.ok) return reply.failure(result.error);

        return reply(200, { ok: true });
      },
    ),
  )
  // 共有
  .openapi(
    ...createEndpoint(
      {
        method: "put",
        path: "/{id}/shares",
        middleware: [requireAuth],
        request: { params: invoiceParamsSchema, body: jsonBody(shareInputSchema) },
        responses: {
          200: json(okResponseSchema, "共有した"),
          ...errorResponses(NotFound, Forbidden),
        },
      },
      async (c, reply, { invoices }) => {
        const { id } = c.req.valid("param");
        const { userId, level } = c.req.valid("json");
        const viewer = c.get("authViewer");

        const result = await invoices.share(id, viewer, userId, level);
        if (!result.ok) return reply.failure(result.error);

        return reply(200, { ok: true });
      },
    ),
  )
  // 共有をやめる
  .openapi(
    ...createEndpoint(
      {
        method: "delete",
        path: "/{id}/shares/{userId}",
        middleware: [requireAuth],
        request: { params: shareParamsSchema },
        responses: {
          200: json(okResponseSchema, "共有をやめた"),
          ...errorResponses(NotFound, Forbidden),
        },
      },
      async (c, reply, { invoices }) => {
        const { id, userId } = c.req.valid("param");
        const viewer = c.get("authViewer");

        const result = await invoices.unshare(id, viewer, userId);
        if (!result.ok) return reply.failure(result.error);

        return reply(200, { ok: true });
      },
    ),
  );
