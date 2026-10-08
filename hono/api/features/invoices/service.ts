import type { CreateInvoiceInput, UpdateInvoiceInput } from "@contract/invoices/type";
import { forbidden, notFound } from "../../lib/errors";
import { loadById } from "../../lib/repository";
import type { InvoiceRow, InvoiceUpdateValues, InvoicesRepository } from "./repository";

export function invoicesService(repo: InvoicesRepository) {
  return {
    // 一覧。自分のものだけ、更新の新しい順
    async listMine(ownerId: string): Promise<InvoiceRow[]> {
      return repo.listByOwnerId(ownerId);
    },

    /** 他人のものは、在ることも知らせない */
    async get(id: string, viewerId: string): Promise<InvoiceRow> {
      const row = await loadById(repo, id);
      if (row.ownerId !== viewerId) throw notFound();

      return row;
    },

    // 作成
    async create(ownerId: string, input: CreateInvoiceInput): Promise<InvoiceRow> {
      const id = crypto.randomUUID();

      await repo.insert({
        id,
        ownerId,
        title: input.title,
        body: input.body,
      });

      return loadById(repo, id);
    },

    /** 書き換えられるのは所有者だけ */
    async update(id: string, viewerId: string, input: UpdateInvoiceInput): Promise<InvoiceRow> {
      const current = await loadById(repo, id);
      if (current.ownerId !== viewerId) throw forbidden();

      const values: InvoiceUpdateValues = {
        title: input.title,
        body: input.body,
        updatedAt: new Date(),
      };

      await repo.update(id, values);

      return loadById(repo, id);
    },

    /** 消せるのは所有者だけ */
    async remove(id: string, viewerId: string): Promise<void> {
      const current = await loadById(repo, id);
      if (current.ownerId !== viewerId) throw forbidden();

      await repo.deleteById(id);
    },
  };
}

export type InvoicesService = ReturnType<typeof invoicesService>;
