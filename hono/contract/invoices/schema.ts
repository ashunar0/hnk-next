import { z } from "zod";

/**
 * invoices の HTTP の入出力の形。フロントもここを import する
 */

// 受け取る形
export const invoiceInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "タイトルを入力してください")
    .max(100, "タイトルは100文字以内です"),
  body: z.string().min(1, "本文を入力してください").max(20000, "本文は20000文字以内です"),
});

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

export type InvoiceResponse = z.infer<typeof invoiceResponseSchema>;
export type ListInvoicesResponse = z.infer<typeof listInvoicesResponseSchema>;
