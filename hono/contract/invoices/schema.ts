import { z } from "zod";
import { invoiceInputSchema } from "./model";

// 受け取る形。今は model の入力そのまま
export const createInvoiceInputSchema = invoiceInputSchema;

export const updateInvoiceInputSchema = invoiceInputSchema;

export const invoiceParamsSchema = z.object({
  id: z.string(),
});

// 返す形
export const invoiceResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const listInvoicesResponseSchema = z.object({
  items: z.array(invoiceResponseSchema),
});

export const deleteInvoiceResponseSchema = z.object({
  ok: z.literal(true),
});
