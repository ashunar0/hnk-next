import { desc, eq } from "drizzle-orm";
import type { Scope } from "../../db";
import { invoices } from "./table";

/** 保存されている 1 行。応答の形とは別 */
export type InvoiceRow = typeof invoices.$inferSelect;

export type NewInvoiceRow = typeof invoices.$inferInsert;
export type InvoiceUpdateValues = Partial<NewInvoiceRow>;

export type InvoicesRepository = {
  listByOwnerId(ownerId: string): Promise<InvoiceRow[]>;
  findById(id: string): Promise<InvoiceRow | null>;
  insert(row: NewInvoiceRow): Promise<void>;
  update(id: string, values: InvoiceUpdateValues): Promise<void>;
  deleteById(id: string): Promise<void>;
};

export function invoicesRepository(scope: Scope<typeof invoices>): InvoicesRepository {
  return {
    async listByOwnerId(ownerId) {
      return scope.reads
        .select()
        .from(invoices)
        .where(eq(invoices.ownerId, ownerId))
        .orderBy(desc(invoices.updatedAt));
    },

    async findById(id) {
      const rows = await scope.reads.select().from(invoices).where(eq(invoices.id, id)).limit(1);

      return rows[0] ?? null;
    },

    async insert(row) {
      await scope.insert(row);
    },

    async update(id, values) {
      await scope.update(values).where(eq(invoices.id, id));
    },

    async deleteById(id) {
      await scope.delete().where(eq(invoices.id, id));
    },
  };
}
