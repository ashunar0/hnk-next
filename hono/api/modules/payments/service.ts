/**
 * 支払いの手順（How）。請求書を確かめ、決済サービスの画面を作り、支払いを記録する
 */
import { err, ok, type Result } from "hnk/result";
import type { System, Viewer } from "../users/domain";
import type { Payment, PaymentEvent } from "./domain";

/** 手順が必要とする保存の形。repo.d1.ts が満たす */
export type PaymentsRepository = {
  insert(payment: Omit<Payment, "createdAt" | "updatedAt">): Promise<Payment>;
  /** 決済サービスの画面を作れたら、その識別子を結びつける */
  attachProviderRef(id: string, providerRef: string): Promise<void>;
  /** 画面を作れなかった支払いを、失敗で閉じる */
  markFailed(id: string): Promise<void>;
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
  /** 支払い画面を作る。利用者を checkoutUrl に送る。同じ paymentId なら、決済サービスが 1 回にまとめる */
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

      // 先に記録 → 外へ → 結果で確定。外に出る前に記録があるので、何が起きたかを後から辿れる。
      // 業務の判断: 画面を作った直後に落ちると、識別子の無い pending が残る（欠けてもよい）。
      // 利用者はまだ画面を受け取っていないので、もう一度始めれば新しい支払いになる
      const payment = await repo.insert({
        id: crypto.randomUUID(),
        invoiceId,
        amount: invoice.value.amount,
        status: "pending",
        providerRef: null,
      });

      const checkout = await gateway.createCheckout({
        paymentId: payment.id,
        amount: payment.amount,
        description: invoice.value.title,
      });
      if (!checkout.ok) {
        await repo.markFailed(payment.id);
        return checkout;
      }

      await repo.attachProviderRef(payment.id, checkout.value.providerRef);

      return ok({
        payment: { ...payment, providerRef: checkout.value.providerRef },
        checkoutUrl: checkout.value.checkoutUrl,
      });
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
