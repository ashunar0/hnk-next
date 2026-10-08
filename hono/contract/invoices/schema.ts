import { z } from "zod";

export const TITLE_MAX = 100;
export const BODY_MAX = 20000;

export const titleSchema = z
  .string()
  .trim()
  .min(1, "タイトルを入力してください")
  .max(TITLE_MAX, `タイトルは${TITLE_MAX}文字以内です`);

export const bodySchema = z
  .string()
  .min(1, "本文を入力してください")
  .max(BODY_MAX, `本文は${BODY_MAX}文字以内です`);

export const createInvoiceInputSchema = z.object({
  title: titleSchema,
  body: bodySchema,
});

export const updateInvoiceInputSchema = createInvoiceInputSchema;

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

export const invoiceParamsSchema = z.object({
  id: z.string(),
});

export const deleteInvoiceResponseSchema = z.object({
  ok: z.literal(true),
});
