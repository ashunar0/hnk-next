import {
  createInvoiceInputSchema,
  deleteInvoiceResponseSchema,
  invoiceParamsSchema,
  invoiceResponseSchema,
  listInvoicesResponseSchema,
  updateInvoiceInputSchema,
} from "@contract/invoices/schema";
import { NotFound, NotOwner, Unauthorized } from "../../errors";
import { createEndpoint, createRoute, createRouter, errorResponses, json, jsonBody, ValidationError } from "hnk";
import { requireAuth } from "../../middleware/auth";
import { invoiceResponse, listInvoicesResponse } from "./presenter";

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
          ...errorResponses(Unauthorized),
        },
      }),
      async (c, reply, { invoices }) => {
        const viewerId = c.get("authUserId");

        const rows = await invoices.listMine(viewerId);

        return reply(200, listInvoicesResponse(rows));
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
          ...errorResponses(ValidationError, Unauthorized, NotFound),
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
        request: { body: jsonBody(createInvoiceInputSchema) },
        responses: {
          200: json(invoiceResponseSchema, "作成した請求書"),
          ...errorResponses(ValidationError, Unauthorized),
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
        request: { params: invoiceParamsSchema, body: jsonBody(updateInvoiceInputSchema) },
        responses: {
          200: json(invoiceResponseSchema, "更新した請求書"),
          ...errorResponses(ValidationError, Unauthorized, NotFound, NotOwner),
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
          ...errorResponses(ValidationError, Unauthorized, NotFound, NotOwner),
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
