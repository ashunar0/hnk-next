import { desc, eq } from "drizzle-orm";
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
