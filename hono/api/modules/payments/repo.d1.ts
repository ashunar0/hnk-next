/**
 * payments の保存。service.ts が宣言した PaymentsRepository を、D1 で満たす
 */
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { ReadDb, Scope } from "../../db";
import { invoicesTable, invoicesWithin } from "../invoices/repo.d1";
import type { Actor } from "../users/domain";
import { paymentStatuses, type Payment } from "./domain";
import type { PaymentsRepository } from "./service";

/** 列の既定値: 今の時刻（ミリ秒）。SQL の式で、JS の Date ではない */
const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/** 請求書ごとの、支払いの試み */
export const paymentsTable = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoicesTable.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    status: text("status", { enum: paymentStatuses }).default("pending").notNull(),
    providerRef: text("provider_ref").unique(),
    checkoutUrl: text("checkout_url"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
  },
  (table) => [
    index("payments_invoice_id_idx").on(table.invoiceId),
    // 1 つの請求書に、進行中（pending）の支払いは 1 つだけ。
    // 2 回押されたり 2 つのタブで開かれたりしても、決済画面は 1 つにする（両方で払われると二重払いになる）
    uniqueIndex("payments_one_pending_idx")
      .on(table.invoiceId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

type PaymentRow = typeof paymentsTable.$inferSelect;

/** 行 → モノ */
const toPayment = (row: PaymentRow): Payment => ({
  id: row.id,
  invoiceId: row.invoiceId,
  amount: row.amount,
  status: row.status,
  providerRef: row.providerRef,
  checkoutUrl: row.checkoutUrl,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/**
 * 他の module が読むための入口。範囲の中の請求書に結ばれた支払いだけが入った副問い合わせを返す。
 * 支払いは組織を持たないので、範囲は請求書を通して決まる
 */
export const paymentsWithin = (db: ReadDb, actor: Actor) => {
  const invoices = invoicesWithin(db, actor);

  return db
    .select(getTableColumns(paymentsTable))
    .from(paymentsTable)
    .innerJoin(invoices, eq(invoices.id, paymentsTable.invoiceId))
    .as("payments_within");
};

export function paymentsRepository(scope: Scope<typeof paymentsTable>): PaymentsRepository {
  return {
    async insertPending(payment) {
      const [row] = await scope
        .insert({ ...payment, status: "pending" })
        .onConflictDoNothing()
        .returning();

      return row ? toPayment(row) : null;
    },

    async findPending(invoiceId) {
      const [row] = await scope.reads
        .select()
        .from(paymentsTable)
        .where(and(eq(paymentsTable.invoiceId, invoiceId), eq(paymentsTable.status, "pending")))
        .limit(1);

      return row ? toPayment(row) : null;
    },

    async attachCheckout(id, { providerRef, checkoutUrl }, now) {
      await scope
        .update({ providerRef, checkoutUrl, updatedAt: now })
        .where(eq(paymentsTable.id, id));
    },

    async markFailed(id, now) {
      await scope.update({ status: "failed", updatedAt: now }).where(eq(paymentsTable.id, id));
    },

    async updateStatusByProviderRef(providerRef, status, now) {
      const [row] = await scope
        .update({ status, updatedAt: now })
        .where(eq(paymentsTable.providerRef, providerRef))
        .returning();

      return row ? toPayment(row) : null;
    },
  };
}
