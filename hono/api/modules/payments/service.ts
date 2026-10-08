/**
 * 支払いの手順（How）。請求書を確かめ、決済サービスの画面を作り、支払いを記録する
 */
import { err, ok, type Result } from "hnk/result";
import type { System, Viewer } from "../users/domain";
import type { Payment, PaymentEvent } from "./domain";

/** 手順が必要とする保存の形。repo.d1.ts が満たす */
export type PaymentsRepository = {
  insert(payment: Omit<Payment, "createdAt" | "updatedAt">): Promise<Payment>;
  /** 決済サービス側の識別子で状態を書き換える。無ければ null */
  updateStatusByProviderRef(
    providerRef: string,
    status: Payment["status"],
  ): Promise<Payment | null>;
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
  /** 届いた通知が本物か確かめ、支払いの結果として読む。支払いに関係ない通知は null */
  verifyEvent(
    payload: string,
    signature: string,
  ): Promise<Result<PaymentEvent | null, "INVALID_SIGNATURE">>;
};

/**
 * 手順が必要とする請求書の形。読みは invoices の service、書きは invoices の commands が満たし、deps.ts でつなぐ。
 * payments は invoices を import しない
 */
export type PayableInvoices = {
  getPayable(
    id: string,
    viewer: Viewer,
  ): Promise<Result<{ id: string; title: string; amount: number }, "NOT_FOUND" | "NOT_PAYABLE">>;
  /** 支払い済みにする。invoices の commands が満たす。何度呼んでも同じ結果になる */
  markPaid(system: System, id: string): Promise<Result<unknown, "NOT_FOUND" | "NOT_PAYABLE">>;
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

    /** 届いた通知を確かめる */
    async verifyEvent(payload: string, signature: string) {
      return gateway.verifyEvent(payload, signature);
    },

    /**
     * 決済サービスから届いた結果を反映する。
     *
     * 成功なら、支払いを成功にしてから、請求書を支払い済みにする。2 つの module に書くが、
     * 1 回の書き込みで変えるのは 1 つずつ。まとめて取り消す仕組みが無いので、
     * どちらも何度やっても同じ結果にしておき、途中で落ちたら決済サービスの再送でやり直す
     */
    async receive(
      system: System,
      event: PaymentEvent,
    ): Promise<Result<void, "NOT_FOUND" | "NOT_PAYABLE">> {
      if (event.kind === "failed") {
        const failed = await repo.updateStatusByProviderRef(event.providerRef, "failed");
        if (failed === null) return err("NOT_FOUND");

        return ok(undefined);
      }

      const payment = await repo.updateStatusByProviderRef(event.providerRef, "succeeded");
      if (payment === null) return err("NOT_FOUND");

      const invoice = await invoices.markPaid(system, payment.invoiceId);
      if (!invoice.ok) return invoice;

      return ok(undefined);
    },
  };
}

export type PaymentsService = ReturnType<typeof paymentsService>;
