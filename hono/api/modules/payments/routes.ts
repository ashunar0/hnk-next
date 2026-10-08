/**
 * payments を HTTP で公開する
 */
import { createEndpoint, createRouter, errorResponses, json, jsonBody } from "hnk";
import { z } from "zod";
import { GatewayFailed, NotFound, NotPayable, PaymentStarting } from "../../errors";
import { requireAuth } from "../../middleware/auth";

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
  .openapi(
    ...createEndpoint(
      {
        method: "post",
        path: "/",
        middleware: [requireAuth] as const,
        request: { body: jsonBody(startPaymentInputSchema) },
        responses: {
          200: json(startPaymentResponseSchema, "決済サービスの支払い画面"),
          ...errorResponses(NotFound, NotPayable, PaymentStarting, GatewayFailed),
        },
      },
      async (c, reply, { payments }) => {
        const { invoiceId } = c.req.valid("json");
        const viewer = c.get("authViewer");

        const result = await payments.start(invoiceId, viewer);
        if (!result.ok) return reply.failure(result.error);

        return reply(200, {
          paymentId: result.value.payment.id,
          checkoutUrl: result.value.checkoutUrl,
        });
      },
    ),
  );
