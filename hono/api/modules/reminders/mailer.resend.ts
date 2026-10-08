/**
 * メールとの接点。service.ts が宣言した Mailer を、Resend で満たす
 */
import { err, ok } from "hnk/result";
import type { Mailer } from "./service";

export function resendMailer(config: { apiKey: string; from: string }): Mailer {
  return {
    async send({ to, subject, body, idempotencyKey }) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ from: config.from, to, subject, text: body }),
      });
      if (!res.ok) return err("MAIL_FAILED");

      return ok(undefined);
    },
  };
}
