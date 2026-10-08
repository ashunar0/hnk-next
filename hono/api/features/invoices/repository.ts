import { and, desc, eq } from "drizzle-orm";
import type { Scope } from "../../db";
import type { InvoicesRepository } from "./service";
import { invoices } from "./table";

/** service が宣言した InvoicesRepository を、D1 で満たす */
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
      const [inserted] = await scope.insert(row).returning();
      if (!inserted) throw new Error(`invoice ${row.id} was not returned after insert`);

      return inserted;
    },

    // 所有者の条件を WHERE に入れて 1 文で書く。確認と書き込みの間に割り込まれない
    async updateOwned(id, ownerId, values) {
      const [row] = await scope
        .update(values)
        .where(and(eq(invoices.id, id), eq(invoices.ownerId, ownerId)))
        .returning();

      return row ?? null;
    },

    async deleteOwned(id, ownerId) {
      const rows = await scope
        .delete()
        .where(and(eq(invoices.id, id), eq(invoices.ownerId, ownerId)))
        .returning({ id: invoices.id });

      return rows.length > 0;
    },
  };
}
