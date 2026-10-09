/**
 * reports の読み。service.ts が宣言した ReportsRepository を、D1 で満たす。
 * 自分のテーブルは持たず、invoices と payments のテーブルを SQL で集計する。
 * 書き込みが無いので、scope ではなく読みだけの db を受け取る
 */
import { and, eq, gte, inArray, lt, sql, type AnyColumn } from "drizzle-orm";
import type { ReadDb } from "../../db";
import { billedStatuses } from "../invoices/domain";
import { invoicesWithin } from "../invoices/repo.d1";
import { paymentsWithin } from "../payments/repo.d1";
import type { ReportsRepository } from "./service";

/** timestamp_ms の列を、月（YYYY-MM、UTC）にする */
const monthOf = (column: AnyColumn) =>
  sql<string>`strftime('%Y-%m', ${column} / 1000, 'unixepoch')`;

export function reportsRepository(db: ReadDb): ReportsRepository {
  return {
    async invoicedByMonth(actor, from, to) {
      // 範囲の中の請求書だけが入った副問い合わせから読む。生の表には触れない
      const invoices = invoicesWithin(db, actor);
      const month = monthOf(invoices.dueAt);

      return db
        .select({ month, total: sql<number>`sum(${invoices.amount})` })
        .from(invoices)
        .where(
          and(
            inArray(invoices.status, billedStatuses),
            gte(invoices.dueAt, from),
            lt(invoices.dueAt, to),
          ),
        )
        .groupBy(month);
    },

    async receivedByMonth(actor, from, to) {
      const payments = paymentsWithin(db, actor);
      const month = monthOf(payments.updatedAt);

      return db
        .select({ month, total: sql<number>`sum(${payments.amount})` })
        .from(payments)
        .where(
          and(
            eq(payments.status, "succeeded"),
            gte(payments.updatedAt, from),
            lt(payments.updatedAt, to),
          ),
        )
        .groupBy(month);
    },
  };
}
