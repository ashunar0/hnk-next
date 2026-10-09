/**
 * 契約テスト: 「期限切れ」のルールは、domain の関数（isOverdue）と repo の SQL の 2 か所にある。
 * 同じ固定データを両方に通し、同じ答えになることを確かめる
 */
import { expect, it } from "vitest";
import { isOverdue } from "./domain";
import { insertInvoices, invoice, invoicesRepo } from "../../../test/fixtures";

const now = new Date("2026-05-15T12:00:00Z");

const fixtures = [
  invoice({ id: "sent-past", status: "sent", dueAt: new Date("2026-05-14T00:00:00Z") }),
  invoice({ id: "sent-future", status: "sent", dueAt: new Date("2026-05-16T00:00:00Z") }),
  // 境目: ちょうど今が期限
  invoice({ id: "sent-now", status: "sent", dueAt: now }),
  invoice({ id: "sent-1ms-before", status: "sent", dueAt: new Date(now.getTime() - 1) }),
  invoice({ id: "draft-past", status: "draft", dueAt: new Date("2026-05-01T00:00:00Z") }),
  invoice({ id: "paid-past", status: "paid", dueAt: new Date("2026-05-01T00:00:00Z") }),
];

it("期限切れの判定が、domain の関数と SQL で一致する", async () => {
  await insertInvoices(fixtures);
  const repo = invoicesRepo();

  const bySql = (await repo.listOverdueWithin({ kind: "all" }, now)).map((i) => i.id).sort();
  const byDomain = fixtures
    .filter((i) => isOverdue(i, now))
    .map((i) => i.id)
    .sort();

  expect(bySql).toEqual(byDomain);
  expect(byDomain).toEqual(["sent-1ms-before", "sent-past"]);
});
