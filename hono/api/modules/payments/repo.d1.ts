/**
 * payments の保存。service.ts が宣言した PaymentsRepository を、D1 で満たす
 */
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { ReadDb, Scope } from "../../db";
import type { InvoiceReach } from "../invoices/domain";
import { invoicesTable, invoicesWithin } from "../invoices/repo.d1";
import { paymentStatuses, type Payment } from "./domain";
import type { PaymentsRepository } from "./service";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

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
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [
    index("payments_invoice_id_idx").on(table.invoiceId),
    // 1 つの請求書に、進行中の支払いは 1 つだけ（domain の ONE_PENDING_PER_INVOICE）
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
export const paymentsWithin = (db: ReadDb, reach: InvoiceReach) => {
  const invoices = invoicesWithin(db, reach);

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

    async attachCheckout(id, { providerRef, checkoutUrl }) {
      await scope
        .update({ providerRef, checkoutUrl, updatedAt: new Date() })
        .where(eq(paymentsTable.id, id));
    },

    async markFailed(id) {
      await scope
        .update({ status: "failed", updatedAt: new Date() })
        .where(eq(paymentsTable.id, id));
    },

    async updateStatusByProviderRef(providerRef, status) {
      const [row] = await scope
        .update({ status, updatedAt: new Date() })
        .where(eq(paymentsTable.providerRef, providerRef))
        .returning();

      return row ? toPayment(row) : null;
    },
  };
}
