/**
 * 請求書の手順（How）。domain のモノを使って、何をどの順でやるか
 */
import type { Page, PageQuery } from "hnk/page";
import { err, ok, type Result } from "hnk/result";
import type { User, Viewer } from "../users/domain";
import {
  canEdit,
  canManage,
  canSend,
  isPayable,
  isRemindable,
  isSendable,
  newInvoiceId,
  reachOf,
  type Invoice,
  type InvoiceAccess,
  type InvoiceChanges,
  type InvoiceId,
  type InvoiceInput,
  type InvoiceReach,
  type InvoiceStatus,
  type ShareLevel,
} from "./domain";

/** 一覧の条件。位置と件数は hnk の PageQuery */
export type InvoiceListQuery = PageQuery & {
  status?: InvoiceStatus;
};

/** 一覧の 1 ページ。位置は更新の新しい順（updatedAt と id）で決まる */
export type InvoicePage = Page<Invoice>;

/**
 * 手順が必要とする保存の形。使う側のここで宣言し、repo.d1.ts がそれを満たす。
 * service は保存の実装を知らないので、テストでは同じ形の偽物を渡せる
 */
export type InvoicesRepository = {
  /** 範囲の中のものを、更新の新しい順に 1 ページ */
  listWithin(reach: InvoiceReach, query: InvoiceListQuery): Promise<InvoicePage>;
  /** 範囲の中の、送付済みで期限を過ぎたもの */
  listOverdueWithin(reach: InvoiceReach, now: Date): Promise<Invoice[]>;
  /** 範囲の中に無ければ null。あれば、閲覧者がどの関係で触れているか（access）と一緒に返す */
  findWithin(
    id: InvoiceId,
    reach: InvoiceReach,
  ): Promise<{ invoice: Invoice; access: InvoiceAccess } | null>;
  insert(invoice: Omit<Invoice, "createdAt" | "updatedAt">): Promise<Invoice>;
  /**
   * 範囲の中のものだけを書き換える。無ければ null。
   * from を渡すと、その状態のときだけ書き換える（確認と書き込みの間に状態が変わっても壊れない）
   */
  updateWithin(
    id: InvoiceId,
    reach: InvoiceReach,
    changes: InvoiceChanges,
    from?: InvoiceStatus,
  ): Promise<Invoice | null>;
  /** 範囲の中のものだけを消す。消せたら true */
  deleteWithin(id: InvoiceId, reach: InvoiceReach): Promise<boolean>;
  /** 共有する。同じ相手にもう共有していれば、権限を置き換える */
  upsertShare(share: { invoiceId: InvoiceId; userId: string; level: ShareLevel }): Promise<void>;
  /** 共有をやめる。無ければ何もしない */
  deleteShare(invoiceId: InvoiceId, userId: string): Promise<void>;
};

export function invoicesService(repo: InvoicesRepository) {
  return {
    // 一覧。触れる範囲のものだけ、更新の新しい順
    async list(viewer: Viewer, query: InvoiceListQuery): Promise<InvoicePage> {
      return repo.listWithin(reachOf(viewer), query);
    },

    /** 期限切れのもの。範囲の中だけ */
    async listOverdue(viewer: Viewer, now: Date): Promise<Invoice[]> {
      return repo.listOverdueWithin(reachOf(viewer), now);
    },

    /** 督促してよい請求書。範囲の中で、期限切れのものだけ */
    async getRemindable(
      id: InvoiceId,
      viewer: Viewer,
      now: Date,
    ): Promise<Result<Invoice, "NOT_FOUND" | "NOT_REMINDABLE">> {
      const found = await repo.findWithin(id, reachOf(viewer));
      if (found === null) return err("NOT_FOUND");
      if (!isRemindable(found.invoice, now)) return err("NOT_REMINDABLE");

      return ok(found.invoice);
    },

    /** 範囲の外のものは、在ることも知らせない */
    async get(id: InvoiceId, viewer: Viewer): Promise<Result<Invoice, "NOT_FOUND">> {
      const found = await repo.findWithin(id, reachOf(viewer));
      if (found === null) return err("NOT_FOUND");

      return ok(found.invoice);
    },

    // 作成。作った人が所有者になる
    async create(viewer: User, input: InvoiceInput): Promise<Invoice> {
      return repo.insert({
        id: newInvoiceId(),
        orgId: viewer.orgId,
        ownerId: viewer.id,
        title: input.title,
        body: input.body,
        amount: input.amount,
        customerEmail: input.customerEmail,
        dueAt: input.dueAt,
        // 作った直後は下書き
        status: "draft",
      });
    },

    /**
     * 書き換えられるのは、範囲の中で、編集できる関係のものだけ。
     * 見た後に共有が取り消されても、書き込みは範囲（組織）の中に留まる
     */
    async update(
      id: InvoiceId,
      viewer: Viewer,
      input: InvoiceInput,
    ): Promise<Result<Invoice, "NOT_FOUND" | "FORBIDDEN">> {
      const reach = reachOf(viewer);

      const found = await repo.findWithin(id, reach);
      if (found === null) return err("NOT_FOUND");
      if (!canEdit(found.access)) return err("FORBIDDEN");

      const invoice = await repo.updateWithin(id, reach, {
        title: input.title,
        body: input.body,
        amount: input.amount,
        customerEmail: input.customerEmail,
        dueAt: input.dueAt,
        updatedAt: new Date(),
      });
      if (invoice === null) return err("NOT_FOUND");

      return ok(invoice);
    },

    /** 支払いに進める請求書。範囲の中で、送付済みのものだけ */
    async getPayable(
      id: InvoiceId,
      viewer: Viewer,
    ): Promise<Result<Invoice, "NOT_FOUND" | "NOT_PAYABLE">> {
      const found = await repo.findWithin(id, reachOf(viewer));
      if (found === null) return err("NOT_FOUND");
      if (!isPayable(found.invoice)) return err("NOT_PAYABLE");

      return ok(found.invoice);
    },

    /** 送付する。admin だけが、下書きだけを送れる */
    async send(
      id: InvoiceId,
      viewer: Viewer,
    ): Promise<Result<Invoice, "NOT_FOUND" | "FORBIDDEN" | "NOT_DRAFT">> {
      const reach = reachOf(viewer);

      const found = await repo.findWithin(id, reach);
      if (found === null) return err("NOT_FOUND");
      if (!canSend(viewer)) return err("FORBIDDEN");
      if (!isSendable(found.invoice)) return err("NOT_DRAFT");

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

    /** 消せるのは、範囲の中で、所有者側の関係のものだけ */
    async remove(id: InvoiceId, viewer: Viewer): Promise<Result<void, "NOT_FOUND" | "FORBIDDEN">> {
      const reach = reachOf(viewer);

      const found = await repo.findWithin(id, reach);
      if (found === null) return err("NOT_FOUND");
      if (!canManage(found.access)) return err("FORBIDDEN");

      const deleted = await repo.deleteWithin(id, reach);
      if (!deleted) return err("NOT_FOUND");

      return ok(undefined);
    },

    /**
     * 同じ組織の誰かに共有する。所有者側（所有者・admin）だけが共有できる。
     * 相手が同じ組織かは、ここでは確かめない（利用者の一覧がまだ無い）。
     * 違う組織の相手に共有しても、範囲が組織で絞るので、その人には見えない
     */
    async share(
      id: InvoiceId,
      viewer: Viewer,
      userId: string,
      level: ShareLevel,
    ): Promise<Result<void, "NOT_FOUND" | "FORBIDDEN">> {
      const found = await repo.findWithin(id, reachOf(viewer));
      if (found === null) return err("NOT_FOUND");
      if (!canManage(found.access)) return err("FORBIDDEN");

      await repo.upsertShare({ invoiceId: id, userId, level });

      return ok(undefined);
    },

    /** 共有をやめる。共有できる人だけ */
    async unshare(
      id: InvoiceId,
      viewer: Viewer,
      userId: string,
    ): Promise<Result<void, "NOT_FOUND" | "FORBIDDEN">> {
      const found = await repo.findWithin(id, reachOf(viewer));
      if (found === null) return err("NOT_FOUND");
      if (!canManage(found.access)) return err("FORBIDDEN");

      await repo.deleteShare(id, userId);

      return ok(undefined);
    },
  };
}

export type InvoicesService = ReturnType<typeof invoicesService>;
