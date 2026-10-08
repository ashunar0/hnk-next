/**
 * 請求書の手順（How）。domain のモノを使って、何をどの順でやるか
 */
import { err, ok, type Result } from "hnk/result";
import type { Viewer } from "../users/domain";
import {
  canSend,
  isSendable,
  reachOf,
  type Invoice,
  type InvoiceChanges,
  type InvoiceInput,
  type InvoiceReach,
  type InvoiceStatus,
} from "./domain";

/** 一覧の中の位置。更新の新しい順に並べるので、updatedAt と id で決まる */
export type InvoiceCursor = Pick<Invoice, "updatedAt" | "id">;

/** 一覧の条件 */
export type InvoiceListQuery = {
  status?: InvoiceStatus;
  /** この位置より後ろから */
  after?: InvoiceCursor;
  limit: number;
};

/** 一覧の 1 ページ。続きが無ければ next は null */
export type InvoicePage = {
  items: Invoice[];
  next: InvoiceCursor | null;
};

/**
 * 手順が必要とする保存の形。使う側のここで宣言し、repo.d1.ts がそれを満たす。
 * service は保存の実装を知らないので、テストでは同じ形の偽物を渡せる
 */
export type InvoicesRepository = {
  /** 範囲の中のものを、更新の新しい順に 1 ページ */
  listWithin(reach: InvoiceReach, query: InvoiceListQuery): Promise<InvoicePage>;
  /** 範囲の中に無ければ null */
  findWithin(id: string, reach: InvoiceReach): Promise<Invoice | null>;
  insert(invoice: Omit<Invoice, "createdAt" | "updatedAt">): Promise<Invoice>;
  /**
   * 範囲の中のものだけを書き換える。無ければ null。
   * from を渡すと、その状態のときだけ書き換える（確認と書き込みの間に状態が変わっても壊れない）
   */
  updateWithin(
    id: string,
    reach: InvoiceReach,
    changes: InvoiceChanges,
    from?: InvoiceStatus,
  ): Promise<Invoice | null>;
  /** 範囲の中のものだけを消す。消せたら true */
  deleteWithin(id: string, reach: InvoiceReach): Promise<boolean>;
};

export function invoicesService(repo: InvoicesRepository) {
  return {
    // 一覧。触れる範囲のものだけ、更新の新しい順
    async list(viewer: Viewer, query: InvoiceListQuery): Promise<InvoicePage> {
      return repo.listWithin(reachOf(viewer), query);
    },

    /** 範囲の外のものは、在ることも知らせない */
    async get(id: string, viewer: Viewer): Promise<Result<Invoice, "NOT_FOUND">> {
      const invoice = await repo.findWithin(id, reachOf(viewer));
      if (invoice === null) return err("NOT_FOUND");

      return ok(invoice);
    },

    // 作成。作った人が所有者になる
    async create(viewer: Viewer, input: InvoiceInput): Promise<Invoice> {
      return repo.insert({
        id: crypto.randomUUID(),
        ownerId: viewer.id,
        title: input.title,
        body: input.body,
        // 作った直後は下書き
        status: "draft",
      });
    },

    /** 書き換えられるのは範囲の中のものだけ */
    async update(
      id: string,
      viewer: Viewer,
      input: InvoiceInput,
    ): Promise<Result<Invoice, "NOT_FOUND">> {
      const invoice = await repo.updateWithin(id, reachOf(viewer), {
        title: input.title,
        body: input.body,
        updatedAt: new Date(),
      });
      if (invoice === null) return err("NOT_FOUND");

      return ok(invoice);
    },

    /** 送付する。admin だけが、下書きだけを送れる */
    async send(
      id: string,
      viewer: Viewer,
    ): Promise<Result<Invoice, "NOT_FOUND" | "FORBIDDEN" | "NOT_DRAFT">> {
      const reach = reachOf(viewer);

      const invoice = await repo.findWithin(id, reach);
      if (invoice === null) return err("NOT_FOUND");
      if (!canSend(viewer)) return err("FORBIDDEN");
      if (!isSendable(invoice)) return err("NOT_DRAFT");

      const sent = await repo.updateWithin(
        id,
        reach,
        { status: "sent", updatedAt: new Date() },
        "draft",
      );
      // 読んだ後に、別の誰かが先に状態を変えた
      if (sent === null) return err("NOT_DRAFT");

      return ok(sent);
    },

    /** 消せるのは範囲の中のものだけ */
    async remove(id: string, viewer: Viewer): Promise<Result<void, "NOT_FOUND">> {
      const deleted = await repo.deleteWithin(id, reachOf(viewer));
      if (!deleted) return err("NOT_FOUND");

      return ok(undefined);
    },
  };
}

export type InvoicesService = ReturnType<typeof invoicesService>;
