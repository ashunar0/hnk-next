/**
 * invoices の保存。service.ts が宣言した InvoicesRepository を、D1 で満たす。
 * 行の形はこのファイルの外に出さず、domain の Invoice に詰め替えて返す
 */
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Scope } from "../../db";
import { invoiceStatuses, type Invoice, type InvoiceReach } from "./domain";
import type { InvoicesRepository } from "./service";

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
    status: text("status", { enum: invoiceStatuses }).default("draft").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [
    // 一覧の並び（自分のもの、更新の新しい順）をそのまま辿る
    index("invoices_owner_updated_idx").on(table.ownerId, table.updatedAt, table.id),
    // admin が全員のものを見るときの並び
    index("invoices_updated_idx").on(table.updatedAt, table.id),
  ],
);

type InvoiceRow = typeof invoicesTable.$inferSelect;

/** 行 → モノ。今は同じ形だが、列が増えても domain に漏らさないための関所 */
const toInvoice = (row: InvoiceRow): Invoice => ({
  id: row.id,
  ownerId: row.ownerId,
  title: row.title,
  body: row.body,
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** 範囲を WHERE の条件にする。all なら絞らない */
const within = (reach: InvoiceReach) =>
  reach.kind === "all" ? undefined : eq(invoicesTable.ownerId, reach.ownerId);

export function invoicesRepository(scope: Scope<typeof invoicesTable>): InvoicesRepository {
  return {
    async listWithin(reach, { status, after, limit }) {
      // 1 件多く読んで、続きがあるかを知る
      const rows = await scope.reads
        .select()
        .from(invoicesTable)
        .where(
          and(
            within(reach),
            status ? eq(invoicesTable.status, status) : undefined,
            after
              ? or(
                  lt(invoicesTable.updatedAt, after.updatedAt),
                  and(eq(invoicesTable.updatedAt, after.updatedAt), lt(invoicesTable.id, after.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(invoicesTable.updatedAt), desc(invoicesTable.id))
        .limit(limit + 1);

      const items = rows.slice(0, limit).map(toInvoice);
      const last = items.at(-1);
      const next = rows.length > limit && last ? { updatedAt: last.updatedAt, id: last.id } : null;

      return { items, next };
    },

    async findWithin(id, reach) {
      const [row] = await scope.reads
        .select()
        .from(invoicesTable)
        .where(and(eq(invoicesTable.id, id), within(reach)))
        .limit(1);

      return row ? toInvoice(row) : null;
    },

    async insert(invoice) {
      const [row] = await scope.insert(invoice).returning();
      if (!row) throw new Error(`invoice ${invoice.id} was not returned after insert`);

      return toInvoice(row);
    },

    // 範囲（と状態）の条件を WHERE に入れて 1 文で書く。確認と書き込みの間に割り込まれない
    async updateWithin(id, reach, changes, from) {
      const [row] = await scope
        .update(changes)
        .where(
          and(
            eq(invoicesTable.id, id),
            within(reach),
            from ? eq(invoicesTable.status, from) : undefined,
          ),
        )
        .returning();

      return row ? toInvoice(row) : null;
    },

    async deleteWithin(id, reach) {
      const rows = await scope
        .delete()
        .where(and(eq(invoicesTable.id, id), within(reach)))
        .returning({ id: invoicesTable.id });

      return rows.length > 0;
    },
  };
}
