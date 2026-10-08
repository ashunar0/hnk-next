import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/** TODO: この表が何を保存するのか、1 行で書く */
export const invoices = sqliteTable(
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

/** 保存されている 1 行。応答の形とは別 */
export type InvoiceRow = typeof invoices.$inferSelect;

export type NewInvoiceRow = typeof invoices.$inferInsert;

/** 書き換えてよい列。id や ownerId は変えられない */
export type InvoiceUpdateValues = Pick<NewInvoiceRow, "title" | "body" | "updatedAt">;
