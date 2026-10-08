/**
 * 決済サービスからの通知を受ける入口。routes.ts と並ぶ、2 つ目の入口。
 * 利用者ではなく Stripe が呼ぶので、ログインではなく署名で確かめる
 */
import { allowSystem, createEndpoint, createRouter, errorResponses, json } from "hnk";
import { z } from "zod";
import { InvalidSignature, NotFound, NotPayable } from "../../errors";

const receivedSchema = z.object({ received: z.literal(true) });

export const stripeWebhookRouter = createRouter().openapi(
  ...createEndpoint(
    {
      method: "post",
      path: "/",
      middleware: [allowSystem] as const,
      responses: {
        200: json(receivedSchema, "受け取った"),
        ...errorResponses(InvalidSignature, NotFound, NotPayable),
      },
    },
    async (c, reply, { payments }) => {
      // 署名は受け取ったままの本文に対して確かめるので、JSON として読まない
      const payload = await c.req.text();
      const signature = c.req.header("Stripe-Signature") ?? "";

      const event = await payments.verifyEvent(payload, signature);
      if (!event.ok) return reply.failure(event.error);
      // 支払いに関係ない通知は、受け取ったことだけ返す
      if (event.value === null) return reply(200, { received: true });

      // 利用者のいない inbound なので、システムとして渡す（署名を確かめた後に）
      const result = await payments.receive(c.get("system"), event.value);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, { received: true });
    },
  ),
);
