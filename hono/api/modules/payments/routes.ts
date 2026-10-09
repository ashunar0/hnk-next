/**
 * payments を HTTP で公開する
 */
import { createRouter, errorResponses, NotFound } from "hnk";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { GatewayFailed, NotPayable, PaymentStarting } from "./domain";

// 受け取る形
const startPaymentInputSchema = z.object({
  invoiceId: z.string(),
});

// 返す形
const startPaymentResponseSchema = z.object({
  paymentId: z.string(),
  /** 利用者をここへ送る */
  checkoutUrl: z.string(),
});

export const paymentsRouter = createRouter()
  // 支払いを始める
  .endpoint(
    {
      method: "post",
      path: "/",
      middleware: [requireAuth],
      request: { json: startPaymentInputSchema },
      responses: {
        200: startPaymentResponseSchema,
        ...errorResponses(NotFound, NotPayable, PaymentStarting, GatewayFailed),
      },
    },
    async (c, reply, { payments }) => {
      const actor = c.get("actor");
      const { invoiceId } = c.req.valid("json");
      const now = new Date();

      const result = await payments.start(actor, invoiceId, now);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, {
        paymentId: result.value.payment.id,
        checkoutUrl: result.value.checkoutUrl,
      });
    },
  );
