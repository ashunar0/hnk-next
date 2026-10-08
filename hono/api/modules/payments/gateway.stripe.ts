/**
 * 決済サービスとの接点。service.ts が宣言した PaymentGateway を、Stripe で満たす。
 * Stripe の API の形と認証はこのファイルの外に出さない
 */
import { err, ok } from "hnk/result";
import type { PaymentGateway } from "./service";

type StripeCheckoutSession = { id: string; url: string };

export function stripeGateway(config: {
  secretKey: string;
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
        },
        body,
      });
      // 決済サービスが答えないのは、利用者の操作では直せない。呼んだ側に失敗として返す
      if (!res.ok) return err("GATEWAY_FAILED");

      const session = (await res.json()) as StripeCheckoutSession;

      return ok({ checkoutUrl: session.url, providerRef: session.id });
    },
  };
}
