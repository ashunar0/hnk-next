/**
 * reminders の保存。service.ts が宣言した RemindersRepository を、D1 で満たす
 */
import { and, eq, sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Scope } from "../../db";
import { invoicesTable } from "../invoices/repo.d1";
import type { RemindersRepository } from "./service";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/** 送った督促。請求書と日で 1 行 */
export const remindersTable = sqliteTable(
  "reminders",
  {
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoicesTable.id, { onDelete: "cascade" }),
    sentOn: text("sent_on").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [primaryKey({ columns: [table.invoiceId, table.sentOn] })],
);

export function remindersRepository(scope: Scope<typeof remindersTable>): RemindersRepository {
  return {
    async exists({ invoiceId, sentOn }) {
      const [row] = await scope.reads
        .select({ invoiceId: remindersTable.invoiceId })
        .from(remindersTable)
        .where(and(eq(remindersTable.invoiceId, invoiceId), eq(remindersTable.sentOn, sentOn)))
        .limit(1);

      return row !== undefined;
    },

    async record(reminder) {
      await scope.insert(reminder).onConflictDoNothing();
    },
  };
}
