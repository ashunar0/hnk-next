/**
 * invoices を HTTP で公開する。入出力の形と、モノ → 応答の変換もここに置く
 */
import { createRouter, errorResponses, pageQuery, pageResponse, pageResponseSchema } from "hnk";
import { z } from "zod";
import { Forbidden, NotFound } from "../../errors";
import { requireAuth } from "../../middleware/auth";
import { NotDraft } from "./errors";
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
  .endpoint(
    {
      method: "get",
      path: "/",
      middleware: [requireAuth],
      request: { query: listInvoicesQuerySchema },
      responses: {
        200: listInvoicesResponseSchema,
      },
    },
    async (c, reply, { invoices }) => {
      const actor = c.get("actor");
      const { status, cursor, limit } = c.req.valid("query");

      const page = await invoices.list(actor, { status, after: cursor, limit });

      return reply(200, pageResponse(page, invoiceResponse));
    },
  )
  // 1件
  .endpoint(
    {
      method: "get",
      path: "/:id",
      middleware: [requireAuth],
      request: { param: invoiceParamsSchema },
      responses: {
        200: invoiceResponseSchema,
        ...errorResponses(NotFound),
      },
    },
    async (c, reply, { invoices }) => {
      const actor = c.get("actor");
      const { id } = c.req.valid("param");

      const result = await invoices.get(actor, id);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, invoiceResponse(result.value));
    },
  )
  // 作成
  .endpoint(
    {
      method: "post",
      path: "/",
      middleware: [requireAuth],
      request: { json: invoiceInputSchema },
      responses: {
        200: invoiceResponseSchema,
      },
    },
    async (c, reply, { invoices }) => {
      const actor = c.get("actor");
      const input = c.req.valid("json");
      const now = new Date();

      const row = await invoices.create(actor, input, now);

      return reply(200, invoiceResponse(row));
    },
  )
  // 更新
  .endpoint(
    {
      method: "put",
      path: "/:id",
      middleware: [requireAuth],
      request: { param: invoiceParamsSchema, json: invoiceInputSchema },
      responses: {
        200: invoiceResponseSchema,
        ...errorResponses(NotFound, Forbidden),
      },
    },
    async (c, reply, { invoices }) => {
      const actor = c.get("actor");
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const now = new Date();

      const result = await invoices.update(actor, id, input, now);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, invoiceResponse(result.value));
    },
  )
  // 送付
  .endpoint(
    {
      method: "post",
      path: "/:id/send",
      middleware: [requireAuth],
      request: { param: invoiceParamsSchema },
      responses: {
        200: invoiceResponseSchema,
        ...errorResponses(NotFound, Forbidden, NotDraft),
      },
    },
    async (c, reply, { invoices }) => {
      const actor = c.get("actor");
      const { id } = c.req.valid("param");
      const now = new Date();

      const result = await invoices.send(actor, id, now);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, invoiceResponse(result.value));
    },
  )
  // 削除
  .endpoint(
    {
      method: "delete",
      path: "/:id",
      middleware: [requireAuth],
      request: { param: invoiceParamsSchema },
      responses: {
        200: deleteInvoiceResponseSchema,
        ...errorResponses(NotFound, Forbidden),
      },
    },
    async (c, reply, { invoices }) => {
      const actor = c.get("actor");
      const { id } = c.req.valid("param");

      const result = await invoices.remove(actor, id);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, { ok: true });
    },
  )
  // 共有
  .endpoint(
    {
      method: "put",
      path: "/:id/shares",
      middleware: [requireAuth],
      request: { param: invoiceParamsSchema, json: shareInputSchema },
      responses: {
        200: okResponseSchema,
        ...errorResponses(NotFound, Forbidden),
      },
    },
    async (c, reply, { invoices }) => {
      const actor = c.get("actor");
      const { id } = c.req.valid("param");
      const { userId, level } = c.req.valid("json");

      const result = await invoices.share(actor, id, userId, level);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, { ok: true });
    },
  )
  // 共有をやめる
  .endpoint(
    {
      method: "delete",
      path: "/:id/shares/:userId",
      middleware: [requireAuth],
      request: { param: shareParamsSchema },
      responses: {
        200: okResponseSchema,
        ...errorResponses(NotFound, Forbidden),
      },
    },
    async (c, reply, { invoices }) => {
      const actor = c.get("actor");
      const { id, userId } = c.req.valid("param");

      const result = await invoices.unshare(actor, id, userId);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, { ok: true });
    },
  );
