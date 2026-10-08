/**
 * 支払いの決着。決済サービスから成功の通知が来たら、支払いを成功にし、請求書を支払い済みにする。
 *
 * 2 つの module に書くので、どちらの module にも置かず、上に載せる。
 * 使う形はここで宣言し、payments と invoices の service が deps.ts で満たす。
 *
 * D1 には 2 つの書き込みをまとめて取り消す仕組みが無い。代わりに、どちらの書き込みも
 * 何度やっても同じ結果になるようにしておく。途中で落ちたら、入口（webhook）が失敗を返し、
 * 決済サービスの再送で最初からやり直す
 */
import { ok, type Result } from "hnk/result";

export type SettlablePayments = {
  markSucceeded(providerRef: string): Promise<Result<{ invoiceId: string }, "NOT_FOUND">>;
};

export type SettlableInvoices = {
  markPaid(id: string): Promise<Result<unknown, "NOT_FOUND" | "NOT_PAYABLE">>;
};

export function settlePayment(payments: SettlablePayments, invoices: SettlableInvoices) {
  return {
    async run(providerRef: string): Promise<Result<void, "NOT_FOUND" | "NOT_PAYABLE">> {
      const payment = await payments.markSucceeded(providerRef);
      if (!payment.ok) return payment;

      const invoice = await invoices.markPaid(payment.value.invoiceId);
      if (!invoice.ok) return invoice;

      return ok(undefined);
    },
  };
}

export type SettlePayment = ReturnType<typeof settlePayment>;
