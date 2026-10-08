import type { InvoiceResponse, ListInvoicesResponse } from "@contract/invoices/type";
import type { InvoiceRow } from "./table";

export function invoiceResponse(row: InvoiceRow): InvoiceResponse {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export function listInvoicesResponse(rows: InvoiceRow[]): ListInvoicesResponse {
  return { items: rows.map(invoiceResponse) };
}
