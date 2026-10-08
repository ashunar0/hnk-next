import { describe, expect, it } from "vitest";
import type { InvoiceCursor } from "../api/modules/invoices/service";
import { alice, bob, insertInvoices, invoice, invoicesRepo } from "./fixtures";

const at = (iso: string) => new Date(iso);

describe("一覧のキーセットのページ送り", () => {
  it("更新の新しい順に、重複も抜けもなく最後まで辿れる。同じ時刻は id の降順", async () => {
    await insertInvoices([
      invoice({ id: "a1", updatedAt: at("2026-03-01T00:00:00Z") }),
      invoice({ id: "a2", updatedAt: at("2026-03-02T00:00:00Z") }),
      // 同じ時刻が 2 件。ページの境目にまたがっても落ちないか
      invoice({ id: "a3", updatedAt: at("2026-03-03T00:00:00Z") }),
      invoice({ id: "a4", updatedAt: at("2026-03-03T00:00:00Z") }),
      invoice({ id: "a5", updatedAt: at("2026-03-04T00:00:00Z") }),
      // 他人のものは出てこない
      invoice({ id: "b1", ownerId: bob.id, updatedAt: at("2026-03-05T00:00:00Z") }),
    ]);
    const repo = invoicesRepo();

    const seen: string[] = [];
    let after: InvoiceCursor | undefined;
    for (let pages = 0; pages < 10; pages++) {
      const page = await repo.listWithin(
        { kind: "member", orgId: alice.orgId, userId: alice.id },
        { after, limit: 2 },
      );
      seen.push(...page.items.map((i) => i.id));
      if (page.next === null) break;
      after = page.next;
    }

    expect(seen).toEqual(["a5", "a4", "a3", "a2", "a1"]);
  });

  it("状態で絞り込める", async () => {
    await insertInvoices([
      invoice({ id: "s1", status: "sent" }),
      invoice({ id: "s2", status: "draft" }),
      invoice({ id: "s3", status: "paid" }),
    ]);
    const repo = invoicesRepo();

    const page = await repo.listWithin(
      { kind: "member", orgId: alice.orgId, userId: alice.id },
      { status: "sent", limit: 10 },
    );

    expect(page.items.map((i) => i.id)).toEqual(["s1"]);
  });
});
