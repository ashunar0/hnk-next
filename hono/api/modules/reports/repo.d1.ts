/**
 * reports の読み。service.ts が宣言した ReportsRepository を、D1 で満たす。
 * 自分のテーブルは持たず、invoices と payments のテーブルを SQL で集計する。
 * 書き込みが無いので、scope ではなく読みだけの db を受け取る
 */
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { ReadDb } from "../../db";
import { billedStatuses } from "../invoices/domain";
import { invoicesTable } from "../invoices/repo.d1";
import { paymentsTable } from "../payments/repo.d1";
import type { ReportsRepository } from "./service";

/** timestamp_ms の列を、月（YYYY-MM、UTC）にする */
const monthOf = (column: typeof invoicesTable.dueAt | typeof paymentsTable.updatedAt) =>
  sql<string>`strftime('%Y-%m', ${column} / 1000, 'unixepoch')`;

export function reportsRepository(db: ReadDb): ReportsRepository {
  return {
    async invoicedByMonth(from, to) {
      const month = monthOf(invoicesTable.dueAt);

      return db
        .select({ month, total: sql<number>`sum(${invoicesTable.amount})` })
        .from(invoicesTable)
        .where(
          and(
            inArray(invoicesTable.status, billedStatuses),
            gte(invoicesTable.dueAt, from),
            lt(invoicesTable.dueAt, to),
          ),
        )
        .groupBy(month);
    },

    async receivedByMonth(from, to) {
      const month = monthOf(paymentsTable.updatedAt);

      return db
        .select({ month, total: sql<number>`sum(${paymentsTable.amount})` })
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.status, "succeeded"),
            gte(paymentsTable.updatedAt, from),
            lt(paymentsTable.updatedAt, to),
          ),
        )
        .groupBy(month);
    },
  };
}
