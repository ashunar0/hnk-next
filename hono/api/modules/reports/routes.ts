/**
 * reports を HTTP で公開する
 */
import { createEndpoint, createRouter, errorResponses, json } from "hnk";
import { z } from "zod";
import { Forbidden } from "../../errors";
import { requireAuth } from "../../middleware/auth";
import { monthsBetween, type Month } from "./domain";

/** 1 回に出せる月の数。重い集計で詰まらないように */
const MAX_MONTHS = 24;

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "月は YYYY-MM で指定してください")
  .transform((value) => value as Month);

// 受け取る形
const monthlyQuerySchema = z
  .object({ from: monthSchema, to: monthSchema })
  .refine(({ from, to }) => from <= to, "from は to 以前にしてください")
  .refine(
    ({ from, to }) => monthsBetween(from, to).length <= MAX_MONTHS,
    `一度に出せるのは ${MAX_MONTHS} か月までです`,
  );

// 返す形
const monthlyResponseSchema = z.object({
  months: z.array(
    z.object({
      month: z.string(),
      invoiced: z.number(),
      received: z.number(),
    }),
  ),
});

export const reportsRouter = createRouter()
  // 月ごとの請求と入金
  .openapi(
    ...createEndpoint(
      {
        method: "get",
        path: "/monthly",
        middleware: [requireAuth],
        request: { query: monthlyQuerySchema },
        responses: {
          200: json(monthlyResponseSchema, "月ごとの請求額と入金額"),
          ...errorResponses(Forbidden),
        },
      },
      async (c, reply, { reports }) => {
        const { from, to } = c.req.valid("query");
        const viewer = c.get("authViewer");

        const result = await reports.monthly(viewer, from, to);
        if (!result.ok) return reply.failure(result.error);

        return reply(200, { months: result.value });
      },
    ),
  );
