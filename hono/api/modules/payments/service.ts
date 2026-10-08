/**
 * 支払いの手順（How）。請求書を確かめ、決済サービスの画面を作り、支払いを記録する
 */
import { ok, type Result } from "hnk/result";
import type { Viewer } from "../users/domain";
import type { Payment } from "./domain";

/** 手順が必要とする保存の形。repo.d1.ts が満たす */
export type PaymentsRepository = {
  insert(payment: Omit<Payment, "createdAt" | "updatedAt">): Promise<Payment>;
};

/**
 * 手順が必要とする決済サービスの形。gateway.stripe.ts が満たす。
 * 決済サービスの都合（API の形、認証、エラーの種類）はここに出さない
 */
export type PaymentGateway = {
  /** 支払い画面を作る。利用者を checkoutUrl に送る */
  createCheckout(input: {
    paymentId: string;
    amount: number;
    description: string;
  }): Promise<Result<{ checkoutUrl: string; providerRef: string }, "GATEWAY_FAILED">>;
};

/**
 * 手順が必要とする請求書の形。invoices の service が満たし、deps.ts でつなぐ。
 * payments は invoices を import しない
 */
export type PayableInvoices = {
  getPayable(
    id: string,
    viewer: Viewer,
  ): Promise<Result<{ id: string; title: string; amount: number }, "NOT_FOUND" | "NOT_PAYABLE">>;
};

export function paymentsService(
  repo: PaymentsRepository,
  gateway: PaymentGateway,
  invoices: PayableInvoices,
) {
  return {
    /** 支払いを始める。送付済みの請求書に対してだけ */
    async start(
      invoiceId: string,
      viewer: Viewer,
    ): Promise<
      Result<
        { payment: Payment; checkoutUrl: string },
        "NOT_FOUND" | "NOT_PAYABLE" | "GATEWAY_FAILED"
      >
    > {
      const invoice = await invoices.getPayable(invoiceId, viewer);
      if (!invoice.ok) return invoice;

      const id = crypto.randomUUID();

      // 先に決済サービスの画面を作る。記録の後で失敗すると、使われない支払いが残るため
      const checkout = await gateway.createCheckout({
        paymentId: id,
        amount: invoice.value.amount,
        description: invoice.value.title,
      });
      if (!checkout.ok) return checkout;

      const payment = await repo.insert({
        id,
        invoiceId,
        amount: invoice.value.amount,
        status: "pending",
        providerRef: checkout.value.providerRef,
      });

      return ok({ payment, checkoutUrl: checkout.value.checkoutUrl });
    },
  };
}

export type PaymentsService = ReturnType<typeof paymentsService>;
