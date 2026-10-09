/**
 * payments だけの失敗を、HTTP でどう返すか。どの module でも同じ意味のものは api/errors.ts にある
 */
import { httpError } from "hnk";

export const NotPayable = httpError("NOT_PAYABLE", 409, "送付済みの請求書だけを支払えます");

export const PaymentStarting = httpError(
  "PAYMENT_STARTING",
  409,
  "支払いの準備中です。少し待ってからやり直してください",
);

export const GatewayFailed = httpError("GATEWAY_FAILED", 502, "決済サービスに接続できませんでした");

export const InvalidSignature = httpError("INVALID_SIGNATURE", 400, "通知の署名が正しくありません");
