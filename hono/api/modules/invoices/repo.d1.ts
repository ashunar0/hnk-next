/**
 * invoices の保存。service.ts が宣言した InvoicesRepository を、D1 で満たす。
 * 行の形はこのファイルの外に出さず、domain の Invoice に詰め替えて返す
 */
import { and, desc, eq, getTableColumns, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { toPage } from "hnk/page";
import type { ReadDb, Scope } from "../../db";
import {
  invoiceStatuses,
  shareLevels,
  unpaidStatuses,
  type Invoice,
  type InvoiceAccess,
  type InvoiceReach,
} from "./domain";
import type { InvoicesRepository } from "./service";

/** 列の既定値: 今の時刻（ミリ秒）。SQL の式で、JS の Date ではない */
const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/** 請求書。組織と所有者を持ち、下書き → 送付済み → 支払い済みと進む。共有は invoice_shares */
export const invoicesTable = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    /** 所有者の利用者 id。利用者の表がまだ無い（認証の提供元を決めたら外部キーを張る）ので、外部キーは無い */
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    amount: integer("amount").notNull(),
    customerEmail: text("customer_email").notNull(),
    dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
    status: text("status", { enum: invoiceStatuses }).default("draft").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
  },
  (table) => [
    // 一覧の並び（自分のもの、更新の新しい順）をそのまま辿る
    index("invoices_owner_updated_idx").on(table.orgId, table.ownerId, table.updatedAt, table.id),
    // 期限切れを探す
    index("invoices_status_due_idx").on(table.status, table.dueAt),
    // admin が組織の全員のものを見るときの並び
    index("invoices_org_updated_idx").on(table.orgId, table.updatedAt, table.id),
  ],
);

/**
 * 請求書の共有。誰に、どの権限で見せているか。
 * 組織の線は持たない——相手の組織が違っても、範囲（within）が組織で絞るので、行は見えない
 */
export const invoiceSharesTable = sqliteTable(
  "invoice_shares",
  {
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoicesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    level: text("level", { enum: shareLevels }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
  },
  (table) => [primaryKey({ columns: [table.invoiceId, table.userId] })],
);

type InvoiceRow = typeof invoicesTable.$inferSelect;

/** 行 → モノ。今は同じ形だが、列が増えても domain に漏らさないための関所 */
const toInvoice = (row: InvoiceRow): Invoice => ({
  id: row.id,
  orgId: row.orgId,
  ownerId: row.ownerId,
  title: row.title,
  body: row.body,
  amount: row.amount,
  customerEmail: row.customerEmail,
  dueAt: row.dueAt,
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** 範囲を WHERE の条件にする。all なら絞らない */
const within = (reach: InvoiceReach) => {
  switch (reach.kind) {
    case "all":
      return undefined;
    case "org":
      return eq(invoicesTable.orgId, reach.orgId);
    case "member":
      return and(
        eq(invoicesTable.orgId, reach.orgId),
        or(
          eq(invoicesTable.ownerId, reach.userId),
          sql`exists (select 1 from ${invoiceSharesTable} where ${invoiceSharesTable.invoiceId} = ${invoicesTable.id} and ${invoiceSharesTable.userId} = ${reach.userId})`,
        ),
      );
  }
};

/** その範囲の閲覧者が、各行にどの関係で触れているか。within と同じ範囲の読みと一緒に使う */
const accessIn = (reach: InvoiceReach): SQL<InvoiceAccess> =>
  reach.kind === "member"
    ? sql<InvoiceAccess>`case when ${invoicesTable.ownerId} = ${reach.userId} then 'manage' else (select ${invoiceSharesTable.level} from ${invoiceSharesTable} where ${invoiceSharesTable.invoiceId} = ${invoicesTable.id} and ${invoiceSharesTable.userId} = ${reach.userId}) end`
    : sql<InvoiceAccess>`'manage'`;

/**
 * 他の module が読むための入口。範囲の中の請求書だけが入った副問い合わせを返す。
 * 範囲が必須なので、範囲を付けずに読む書き方が存在しない
 */
export const invoicesWithin = (db: ReadDb, reach: InvoiceReach) =>
  db.select().from(invoicesTable).where(within(reach)).as("invoices_within");

export function invoicesRepository(
  scope: Scope<typeof invoicesTable>,
  shares: Scope<typeof invoiceSharesTable>,
): InvoicesRepository {
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
                  lt(invoicesTable.updatedAt, after.at),
                  and(eq(invoicesTable.updatedAt, after.at), lt(invoicesTable.id, after.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(invoicesTable.updatedAt), desc(invoicesTable.id))
        .limit(limit + 1);

      return toPage(rows.map(toInvoice), limit, (invoice) => ({
        at: invoice.updatedAt,
        id: invoice.id,
      }));
    },

    async listOverdueWithin(reach, now) {
      const rows = await scope.reads
        .select()
        .from(invoicesTable)
        .where(
          and(
            within(reach),
            inArray(invoicesTable.status, unpaidStatuses),
            lt(invoicesTable.dueAt, now),
          ),
        );

      return rows.map(toInvoice);
    },

    async findWithin(id, reach) {
      const [row] = await scope.reads
        .select({ invoice: getTableColumns(invoicesTable), access: accessIn(reach) })
        .from(invoicesTable)
        .where(and(eq(invoicesTable.id, id), within(reach)))
        .limit(1);

      return row ? { invoice: toInvoice(row.invoice), access: row.access } : null;
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

    async upsertShare(share) {
      await shares.insert(share).onConflictDoUpdate({
        target: [invoiceSharesTable.invoiceId, invoiceSharesTable.userId],
        set: { level: share.level },
      });
    },

    async deleteShare(invoiceId, userId) {
      await shares
        .delete()
        .where(
          and(eq(invoiceSharesTable.invoiceId, invoiceId), eq(invoiceSharesTable.userId, userId)),
        );
    },
  };
}
