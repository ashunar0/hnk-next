/**
 * 請求書の手順（How）。domain のモノを使って、何をどの順でやるか
 */
import { err, ok, type Result } from "hnk/result";
import type { Invoice, InvoiceChanges, InvoiceInput } from "./domain";

/**
 * 手順が必要とする保存の形。使う側のここで宣言し、repo.d1.ts がそれを満たす。
 * service は保存の実装を知らないので、テストでは同じ形の偽物を渡せる
 */
export type InvoicesRepository = {
  listByOwnerId(ownerId: string): Promise<Invoice[]>;
  findById(id: string): Promise<Invoice | null>;
  insert(invoice: Omit<Invoice, "createdAt" | "updatedAt">): Promise<Invoice>;
  /** 所有者が一致するものだけを書き換える。無ければ null */
  updateOwned(id: string, ownerId: string, changes: InvoiceChanges): Promise<Invoice | null>;
  /** 所有者が一致するものだけを消す。消せたら true */
  deleteOwned(id: string, ownerId: string): Promise<boolean>;
};

export function invoicesService(repo: InvoicesRepository) {
  return {
    // 一覧。自分のものだけ、更新の新しい順
    async listMine(ownerId: string): Promise<Invoice[]> {
      return repo.listByOwnerId(ownerId);
    },

    /** 他人のものは、在ることも知らせない */
    async get(id: string, viewerId: string): Promise<Result<Invoice, "NOT_FOUND">> {
      const invoice = await repo.findById(id);
      if (invoice === null || invoice.ownerId !== viewerId) return err("NOT_FOUND");

      return ok(invoice);
    },

    // 作成
    async create(ownerId: string, input: InvoiceInput): Promise<Invoice> {
      return repo.insert({
        id: crypto.randomUUID(),
        ownerId,
        title: input.title,
        body: input.body,
      });
    },

    /** 書き換えられるのは所有者だけ。他人のものは、在ることも知らせない */
    async update(
      id: string,
      viewerId: string,
      input: InvoiceInput,
    ): Promise<Result<Invoice, "NOT_FOUND">> {
      const invoice = await repo.updateOwned(id, viewerId, {
        title: input.title,
        body: input.body,
        updatedAt: new Date(),
      });
      if (invoice === null) return err("NOT_FOUND");

      return ok(invoice);
    },

    /** 消せるのは所有者だけ。他人のものは、在ることも知らせない */
    async remove(id: string, viewerId: string): Promise<Result<void, "NOT_FOUND">> {
      const deleted = await repo.deleteOwned(id, viewerId);
      if (!deleted) return err("NOT_FOUND");

      return ok(undefined);
    },
  };
}

export type InvoicesService = ReturnType<typeof invoicesService>;
