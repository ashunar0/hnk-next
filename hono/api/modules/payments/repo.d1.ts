/**
 * payments の保存。service.ts が宣言した PaymentsRepository を、D1 で満たす
 */
import { eq, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Scope } from "../../db";
import { invoicesTable } from "../invoices/repo.d1";
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
    providerRef: text("provider_ref").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [index("payments_invoice_id_idx").on(table.invoiceId)],
);

type PaymentRow = typeof paymentsTable.$inferSelect;

/** 行 → モノ */
const toPayment = (row: PaymentRow): Payment => ({
  id: row.id,
  invoiceId: row.invoiceId,
  amount: row.amount,
  status: row.status,
  providerRef: row.providerRef,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export function paymentsRepository(scope: Scope<typeof paymentsTable>): PaymentsRepository {
  return {
    async insert(payment) {
      const [row] = await scope.insert(payment).returning();
      if (!row) throw new Error(`payment ${payment.id} was not returned after insert`);

      return toPayment(row);
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
