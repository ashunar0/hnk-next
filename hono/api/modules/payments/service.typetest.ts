import type { InvoicesService } from "../invoices/service";
import type { PayableInvoices } from "./service";

// 他の module の ID の印は、つなぐ場所（deps.ts）で付ける。印を要求する関数を、そのまま渡すことはできない
export function idsAreMintedWhereWired(invoices: InvoicesService) {
  const direct: PayableInvoices = {
    // @ts-expect-error InvoiceId を要求する関数は、string を受け取る宣言には渡せない
    getPayable: invoices.getPayable,
    // @ts-expect-error 同じく
    markPaid: invoices.markPaid,
  };
  return direct;
}
