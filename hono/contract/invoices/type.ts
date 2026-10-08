import type { z } from "zod";
import type {
  createInvoiceInputSchema,
  invoiceResponseSchema,
  listInvoicesResponseSchema,
  updateInvoiceInputSchema,
} from "./schema";

export type CreateInvoiceInput = z.infer<typeof createInvoiceInputSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceInputSchema>;
export type InvoiceResponse = z.infer<typeof invoiceResponseSchema>;
export type ListInvoicesResponse = z.infer<typeof listInvoicesResponseSchema>;
