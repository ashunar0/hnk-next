/**
 * 決済サービスからの通知を受ける入口。routes.ts と並ぶ、2 つ目の入口。
 * 利用者ではなく Stripe が呼ぶので、ログインではなく署名で確かめる
 */
import { createEndpoint, createRoute, createRouter, errorResponses, json } from "hnk";
import { z } from "zod";
import { InvalidSignature, NotFound, NotPayable } from "../../errors";
import { allowAnonymous } from "../../middleware/auth";

const receivedSchema = z.object({ received: z.literal(true) });

export const stripeWebhookRouter = createRouter().openapi(
  ...createEndpoint(
    createRoute({
      method: "post",
      path: "/",
      middleware: [allowAnonymous] as const,
      responses: {
        200: json(receivedSchema, "受け取った"),
        ...errorResponses(InvalidSignature, NotFound, NotPayable),
      },
    }),
    async (c, reply, { payments, settlePayment }) => {
      // 署名は受け取ったままの本文に対して確かめるので、JSON として読まない
      const payload = await c.req.text();
      const signature = c.req.header("Stripe-Signature") ?? "";

      const event = await payments.verifyEvent(payload, signature);
      if (!event.ok) return reply.failure(event.error);
      // 支払いに関係ない通知は、受け取ったことだけ返す
      if (event.value === null) return reply(200, { received: true });

      const result =
        event.value.kind === "succeeded"
          ? await settlePayment.run(event.value.providerRef)
          : await payments.markFailed(event.value.providerRef);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, { received: true });
    },
  ),
);
