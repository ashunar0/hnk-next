import { err, ok, type Result } from "hnk/result";
import type { InvoiceRow, InvoiceUpdateValues, NewInvoiceRow } from "./table";

/** 作成・更新で受け取る値。検査は route が済ませている */
export type InvoiceInput = { title: string; body: string };

/**
 * この service が必要とする保存の形。使う側のここで宣言し、repository.ts がそれを満たす。
 * service は repository.ts を知らないので、テストでは同じ形の偽物を渡せる
 */
export type InvoicesRepository = {
  listByOwnerId(ownerId: string): Promise<InvoiceRow[]>;
  findById(id: string): Promise<InvoiceRow | null>;
  insert(row: NewInvoiceRow): Promise<InvoiceRow>;
  /** 所有者が一致する行だけを書き換える。無ければ null */
  updateOwned(id: string, ownerId: string, values: InvoiceUpdateValues): Promise<InvoiceRow | null>;
  /** 所有者が一致する行だけを消す。消せたら true */
  deleteOwned(id: string, ownerId: string): Promise<boolean>;
};

export function invoicesService(repo: InvoicesRepository) {
  return {
    // 一覧。自分のものだけ、更新の新しい順
    async listMine(ownerId: string): Promise<InvoiceRow[]> {
      return repo.listByOwnerId(ownerId);
    },

    /** 他人のものは、在ることも知らせない */
    async get(id: string, viewerId: string): Promise<Result<InvoiceRow, "NOT_FOUND">> {
      const row = await repo.findById(id);
      if (row === null || row.ownerId !== viewerId) return err("NOT_FOUND");

      return ok(row);
    },

    // 作成
    async create(ownerId: string, input: InvoiceInput): Promise<InvoiceRow> {
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
    ): Promise<Result<InvoiceRow, "NOT_FOUND">> {
      const row = await repo.updateOwned(id, viewerId, {
        title: input.title,
        body: input.body,
        updatedAt: new Date(),
      });
      if (row === null) return err("NOT_FOUND");

      return ok(row);
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
