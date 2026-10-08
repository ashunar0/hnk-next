/**
 * 支払いというモノ。1 つの請求書に対する、1 回の支払いの試み（What）。
 * 手順も HTTP も DB も決済サービスも知らない
 */

/** 支払いの状態。決済サービスの画面に送った → 成功 / 失敗 */
export const paymentStatuses = ["pending", "succeeded", "failed"] as const;

export type PaymentStatus = (typeof paymentStatuses)[number];

export type Payment = {
  id: string;
  invoiceId: string;
  /** 支払う額（円）。始めた時点の請求額を写す */
  amount: number;
  status: PaymentStatus;
  /** 決済サービス側での識別子。結果の通知と突き合わせるのに使う */
  providerRef: string;
  createdAt: Date;
  updatedAt: Date;
};
