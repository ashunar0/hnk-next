import { err, ok, type Result } from "hnk/result";
import type { InvoiceRow, InvoiceUpdateValues, NewInvoiceRow } from "../../db/schema";

/** 作成・更新で受け取る値。検査は route が済ませている */
export type InvoiceInput = { title: string; body: string };

/**
 * この service が必要とする保存の形。使う側のここで宣言し、repository.ts がそれを満たす。
 * service は repository.ts を知らないので、テストでは同じ形の偽物を渡せる
 */
export type InvoicesRepository = {
  listByOwnerId(ownerId: string): Promise<InvoiceRow[]>;
  findById(id: string): Promise<InvoiceRow | null>;
  insert(row: NewInvoiceRow): Promise<void>;
  update(id: string, values: InvoiceUpdateValues): Promise<void>;
  deleteById(id: string): Promise<void>;
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
      const id = crypto.randomUUID();

      await repo.insert({
        id,
        ownerId,
        title: input.title,
        body: input.body,
      });

      return mustFind(repo, id);
    },

    /** 書き換えられるのは所有者だけ */
    async update(
      id: string,
      viewerId: string,
      input: InvoiceInput,
    ): Promise<Result<InvoiceRow, "NOT_FOUND" | "NOT_OWNER">> {
      const current = await repo.findById(id);
      if (current === null) return err("NOT_FOUND");
      if (current.ownerId !== viewerId) return err("NOT_OWNER");

      const values: InvoiceUpdateValues = {
        title: input.title,
        body: input.body,
        updatedAt: new Date(),
      };

      await repo.update(id, values);

      return ok(await mustFind(repo, id));
    },

    /** 消せるのは所有者だけ */
    async remove(id: string, viewerId: string): Promise<Result<void, "NOT_FOUND" | "NOT_OWNER">> {
      const current = await repo.findById(id);
      if (current === null) return err("NOT_FOUND");
      if (current.ownerId !== viewerId) return err("NOT_OWNER");

      await repo.deleteById(id);

      return ok(undefined);
    },
  };
}

export type InvoicesService = ReturnType<typeof invoicesService>;

/** 書いた直後に読み直す。無ければ想定外なので throw する */
async function mustFind(repo: InvoicesRepository, id: string): Promise<InvoiceRow> {
  const row = await repo.findById(id);
  if (row === null) throw new Error(`invoice ${id} disappeared right after write`);

  return row;
}
