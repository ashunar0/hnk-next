/**
 * 決済サービスとの接点。service.ts が宣言した PaymentGateway を、Stripe で満たす。
 * Stripe の API の形と認証はこのファイルの外に出さない
 */
import { err, ok } from "hnk/result";
import type { PaymentEvent } from "./domain";
import type { PaymentGateway } from "./service";

type StripeCheckoutSession = { id: string; url: string };

type StripeEvent = { type: string; data: { object: { id: string } } };

/** Stripe の通知の種類を、支払いの結果に読み替える。関係ない通知は null */
const KINDS: Record<string, PaymentEvent["kind"]> = {
  "checkout.session.completed": "succeeded",
  "checkout.session.expired": "failed",
};

/** Stripe-Signature（t=...,v1=...）を確かめる。HMAC-SHA256 で `${t}.${payload}` を署名している */
async function isSigned(payload: string, header: string, secret: string) {
  const parts = new Map(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  // TODO: 本物では、時間差の出ない比較と、t が古すぎないかの確認をする
  return hex === v1;
}

export function stripeGateway(config: {
  secretKey: string;
  webhookSecret: string;
  successUrl: string;
  cancelUrl: string;
}): PaymentGateway {
  return {
    async createCheckout({ paymentId, amount, description }) {
      const body = new URLSearchParams({
        mode: "payment",
        success_url: config.successUrl,
        cancel_url: config.cancelUrl,
        client_reference_id: paymentId,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "jpy",
        "line_items[0][price_data][unit_amount]": String(amount),
        "line_items[0][price_data][product_data][name]": description,
      });

      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          // 同じ支払いで作り直しても、Stripe が 1 回にまとめる
          "Idempotency-Key": paymentId,
        },
        body,
      });
      // 決済サービスが答えないのは、利用者の操作では直せない。呼んだ側に失敗として返す
      if (!res.ok) return err("GATEWAY_FAILED");

      const session = (await res.json()) as StripeCheckoutSession;

      return ok({ checkoutUrl: session.url, providerRef: session.id });
    },

    async verifyEvent(payload, signature) {
      if (!(await isSigned(payload, signature, config.webhookSecret)))
        return err("INVALID_SIGNATURE");

      const event = JSON.parse(payload) as StripeEvent;
      const kind = KINDS[event.type];
      if (!kind) return ok(null);

      return ok({ kind, providerRef: event.data.object.id });
    },
  };
}
