/**
 * invoices の保存。domain.ts が宣言した InvoicesRepository を、D1 で満たす。
 * 行の形はこのファイルの外に出さず、domain の Invoice に詰め替えて返す
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Scope } from "../../db";
import type { Invoice, InvoicesRepository } from "./domain";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/** TODO: この表が何を保存するのか、1 行で書く */
export const invoicesTable = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    /** TODO: 所有者の表へ外部キーを張る。.references(() => profiles.userId, { onDelete: "cascade" }) */
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [
    index("invoices_owner_id_idx").on(table.ownerId),
    index("invoices_updated_at_idx").on(table.updatedAt),
  ],
);

type InvoiceRow = typeof invoicesTable.$inferSelect;

/** 行 → モノ。今は同じ形だが、列が増えても domain に漏らさないための関所 */
const toInvoice = (row: InvoiceRow): Invoice => ({
  id: row.id,
  ownerId: row.ownerId,
  title: row.title,
  body: row.body,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export function invoicesRepository(scope: Scope<typeof invoicesTable>): InvoicesRepository {
  return {
    async listByOwnerId(ownerId) {
      const rows = await scope.reads
        .select()
        .from(invoicesTable)
        .where(eq(invoicesTable.ownerId, ownerId))
        .orderBy(desc(invoicesTable.updatedAt));

      return rows.map(toInvoice);
    },

    async findById(id) {
      const [row] = await scope.reads
        .select()
        .from(invoicesTable)
        .where(eq(invoicesTable.id, id))
        .limit(1);

      return row ? toInvoice(row) : null;
    },

    async insert(invoice) {
      const [row] = await scope.insert(invoice).returning();
      if (!row) throw new Error(`invoice ${invoice.id} was not returned after insert`);

      return toInvoice(row);
    },

    // 所有者の条件を WHERE に入れて 1 文で書く。確認と書き込みの間に割り込まれない
    async updateOwned(id, ownerId, changes) {
      const [row] = await scope
        .update(changes)
        .where(and(eq(invoicesTable.id, id), eq(invoicesTable.ownerId, ownerId)))
        .returning();

      return row ? toInvoice(row) : null;
    },

    async deleteOwned(id, ownerId) {
      const rows = await scope
        .delete()
        .where(and(eq(invoicesTable.id, id), eq(invoicesTable.ownerId, ownerId)))
        .returning({ id: invoicesTable.id });

      return rows.length > 0;
    },
  };
}
