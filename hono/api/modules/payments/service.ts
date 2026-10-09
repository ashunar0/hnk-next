/**
 * 支払いの手順（How）。請求書を確かめ、決済サービスの画面を作り、支払いを記録する
 */
import { err, ok, type Result } from "hnk/result";
import type { System } from "hnk/system";
import type { Actor } from "../users/domain";
import { isStale, type Payment, type PaymentEvent } from "./domain";

/** 手順が必要とする保存の形。repo.d1.ts が満たす */
export type PaymentsRepository = {
  /**
   * 進行中の支払いを記録する。その請求書に進行中のものがすでにあれば何もせず null を返す
   * （DB の部分ユニーク索引が、同時に 2 つ記録されるのを止める）
   */
  insertPending(payment: Omit<Payment, "status">): Promise<Payment | null>;
  /** その請求書の、進行中の支払い */
  findPending(invoiceId: string): Promise<Payment | null>;
  /** 決済サービスの画面を作れたら、その識別子と URL を結びつける */
  attachCheckout(
    id: string,
    checkout: { providerRef: string; checkoutUrl: string },
    now: Date,
  ): Promise<void>;
  /** 画面を作れなかった支払いを、失敗で閉じる */
  markFailed(id: string, now: Date): Promise<void>;
  /** 決済サービス側の識別子で状態を書き換える。無ければ null */
  updateStatusByProviderRef(
    providerRef: string,
    status: Payment["status"],
    now: Date,
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
  // メソッドの書き方ではなく関数の型で宣言する。引数の型が厳しい関数（InvoiceId を要求する側）を
  // そのまま渡すと型エラーになり、deps.ts で印を付けて渡すことになる
  getPayable: (
    actor: Actor,
    id: string,
  ) => Promise<Result<{ id: string; title: string; amount: number }, "NOT_FOUND" | "NOT_PAYABLE">>;
  /** 支払い済みにする。invoices の commands が満たす。何度呼んでも同じ結果になる */
  markPaid: (
    system: System,
    id: string,
    now: Date,
  ) => Promise<Result<unknown, "NOT_FOUND" | "NOT_PAYABLE">>;
};

/** 引数の順番は、誰として（actor）→ 何を → どうする → いつ（now）。時計は読まない */
export function paymentsService(
  repo: PaymentsRepository,
  gateway: PaymentGateway,
  invoices: PayableInvoices,
) {
  return {
    /** 支払いを始める。送付済みの請求書に対してだけ */
    async start(
      actor: Actor,
      invoiceId: string,
      now: Date,
    ): Promise<
      Result<
        { payment: Payment; checkoutUrl: string },
        "NOT_FOUND" | "NOT_PAYABLE" | "GATEWAY_FAILED" | "PAYMENT_STARTING"
      >
    > {
      const invoice = await invoices.getPayable(actor, invoiceId);
      if (!invoice.ok) return invoice;

      // 1 つの請求書に進行中の支払いは 1 つ。2 回目は、1 回目の決済画面をそのまま返す
      const existing = await repo.findPending(invoiceId);
      if (existing !== null) {
        if (existing.checkoutUrl !== null)
          return ok({ payment: existing, checkoutUrl: existing.checkoutUrl });
        // 画面を作っている途中。ただし長く止まっているものは、途中で落ちたとみなして閉じ、作り直す
        if (!isStale(existing, now)) return err("PAYMENT_STARTING");
        await repo.markFailed(existing.id, now);
      }

      // 先に記録 → 外へ → 結果で確定。外に出る前に記録があるので、何が起きたかを後から辿れる。
      // 業務の判断: 画面を作った直後に落ちると、画面の無い pending が残る（欠けてもよい）。
      // 利用者はまだ画面を受け取っていないので、しばらくして始め直せば、古いものを閉じて新しく作る
      const payment = await repo.insertPending({
        id: crypto.randomUUID(),
        invoiceId,
        amount: invoice.value.amount,
        providerRef: null,
        checkoutUrl: null,
        createdAt: now,
        updatedAt: now,
      });
      // 同時に始めた別のリクエストが、先に記録した
      if (payment === null) return err("PAYMENT_STARTING");

      const checkout = await gateway.createCheckout({
        paymentId: payment.id,
        amount: payment.amount,
        description: invoice.value.title,
      });
      if (!checkout.ok) {
        await repo.markFailed(payment.id, now);
        return checkout;
      }

      await repo.attachCheckout(payment.id, checkout.value, now);

      return ok({
        payment: { ...payment, ...checkout.value },
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
      now: Date,
    ): Promise<Result<void, "NOT_FOUND" | "NOT_PAYABLE">> {
      if (event.kind === "failed") {
        const failed = await repo.updateStatusByProviderRef(event.providerRef, "failed", now);
        if (failed === null) return err("NOT_FOUND");

        return ok(undefined);
      }

      const payment = await repo.updateStatusByProviderRef(event.providerRef, "succeeded", now);
      if (payment === null) return err("NOT_FOUND");

      const invoice = await invoices.markPaid(system, payment.invoiceId, now);
      if (!invoice.ok) return invoice;

      return ok(undefined);
    },
  };
}

export type PaymentsService = ReturnType<typeof paymentsService>;
