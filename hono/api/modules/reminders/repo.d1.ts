/**
 * reminders の保存。service.ts が宣言した RemindersRepository を、D1 で満たす
 */
import { and, eq, sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Scope } from "../../db";
import { invoicesTable } from "../invoices/repo.d1";
import { reminderStatuses } from "./domain";
import type { RemindersRepository } from "./service";

/** 列の既定値: 今の時刻（ミリ秒）。SQL の式で、JS の Date ではない */
const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/** 送った督促。請求書と日で 1 行 */
export const remindersTable = sqliteTable(
  "reminders",
  {
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoicesTable.id, { onDelete: "cascade" }),
    sentOn: text("sent_on").notNull(),
    status: text("status", { enum: reminderStatuses }).default("claimed").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
  },
  (table) => [primaryKey({ columns: [table.invoiceId, table.sentOn] })],
);

export function remindersRepository(scope: Scope<typeof remindersTable>): RemindersRepository {
  return {
    async claim(reminder) {
      await scope.insert({ ...reminder, status: "claimed" }).onConflictDoNothing();

      const [row] = await scope.reads
        .select({ status: remindersTable.status })
        .from(remindersTable)
        .where(
          and(
            eq(remindersTable.invoiceId, reminder.invoiceId),
            eq(remindersTable.sentOn, reminder.sentOn),
          ),
        )
        .limit(1);
      if (!row)
        throw new Error(`reminder ${reminder.invoiceId}/${reminder.sentOn} was not claimed`);

      return row.status;
    },

    async markSent({ invoiceId, sentOn }) {
      await scope
        .update({ status: "sent" })
        .where(and(eq(remindersTable.invoiceId, invoiceId), eq(remindersTable.sentOn, sentOn)));
    },

    async markSkipped({ invoiceId, sentOn }) {
      await scope
        .update({ status: "skipped" })
        .where(and(eq(remindersTable.invoiceId, invoiceId), eq(remindersTable.sentOn, sentOn)));
    },
  };
}
