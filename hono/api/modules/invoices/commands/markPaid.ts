/**
 * 請求書を支払い済みにする。invoices が、他の module に変えさせてよい操作の 1 つ。
 *
 * 利用者の操作ではなく、決済の結果を受けて行う操作なので、システムの印を受け取る。
 * routes からは呼べない（deps はこれを routes に渡さず、payments にだけ渡す）。
 * 何度呼んでも同じ結果になる（すでに支払い済みなら、そのまま返す）。時刻（now）は呼び出し元の入口が決める
 */
import { err, ok, type Result } from "hnk/result";
import type { System } from "hnk/system";
import { reachOf, type Invoice, type InvoiceId } from "../domain";
import type { InvoicesRepository } from "../service";

export function markPaid(repo: Pick<InvoicesRepository, "updateWithin" | "findWithin">) {
  return async (
    system: System,
    id: InvoiceId,
    now: Date,
  ): Promise<Result<Invoice, "NOT_FOUND" | "NOT_PAYABLE">> => {
    const all = reachOf(system);

    const paid = await repo.updateWithin(id, all, { status: "paid", updatedAt: now }, "sent");
    if (paid !== null) return ok(paid);

    // 書き換わらなかった。無いのか、もう支払い済みなのか、送付前なのか
    const found = await repo.findWithin(id, all);
    if (found === null) return err("NOT_FOUND");
    if (found.invoice.status === "paid") return ok(found.invoice);

    return err("NOT_PAYABLE");
  };
}
