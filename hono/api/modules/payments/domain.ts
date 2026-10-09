/**
 * 支払いというモノ。1 つの請求書に対する、1 回の支払いの試み（What）。
 * 手順も HTTP も DB も決済サービスも知らない
 */

/** 請求書が支払える状態ではない */
export const NotPayable = {
  code: "NOT_PAYABLE",
  kind: "conflict",
  message: "送付済みの請求書だけを支払えます",
} as const;

/** 同じ請求書の支払いの準備が、まだ終わっていない */
export const PaymentStarting = {
  code: "PAYMENT_STARTING",
  kind: "conflict",
  message: "支払いの準備中です。少し待ってからやり直してください",
} as const;

/** 決済サービスに繋がらなかった */
export const GatewayFailed = {
  code: "GATEWAY_FAILED",
  kind: "upstream",
  message: "決済サービスに接続できませんでした",
} as const;

/** 支払いの状態。決済サービスの画面に送った → 成功 / 失敗 */
export const paymentStatuses = ["pending", "succeeded", "failed"] as const;

export type PaymentStatus = (typeof paymentStatuses)[number];

export type Payment = {
  id: string;
  invoiceId: string;
  /** 支払う額（円）。始めた時点の請求額を写す */
  amount: number;
  status: PaymentStatus;
  /** 決済サービス側での識別子。結果の通知と突き合わせるのに使う。画面を作る前は null */
  providerRef: string | null;
  /** 利用者を送る決済画面。2 回目に始められたときに同じ画面を返すため、覚えておく。画面を作る前は null */
  checkoutUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** 決済サービスから届いた、支払いの結果 */
export type PaymentEvent = {
  kind: "succeeded" | "failed";
  /** どの支払いの結果か。Payment.providerRef と突き合わせる */
  providerRef: string;
};

/** 決済画面を作る前のまま、これより長く止まっている支払いは、作る途中で落ちたものとみなす */
export const STALE_AFTER_MS = 60_000;

/** 作る途中で落ちて、放っておかれた支払いか */
export const isStale = (payment: Payment, now: Date) =>
  payment.status === "pending" &&
  payment.checkoutUrl === null &&
  now.getTime() - payment.createdAt.getTime() > STALE_AFTER_MS;
