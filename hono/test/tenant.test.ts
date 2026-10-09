import { orgId } from "../api/modules/users/domain";
import { invoiceId } from "../api/modules/invoices/domain";
import { expect, it } from "vitest";
import { scopeTo } from "../api/db";
import { invoicesService } from "../api/modules/invoices/service";
import { paymentsTable } from "../api/modules/payments/repo.d1";
import { reportsRepository } from "../api/modules/reports/repo.d1";
import { reportsService } from "../api/modules/reports/service";
import { systemActor } from "hnk/testing";
import { admin, admin2, alice, carol, db, insertInvoices, invoice, invoicesRepo } from "./fixtures";

const service = () => invoicesService(invoicesRepo());

const now = new Date("2026-01-15T00:00:00Z");

/** テスト同士で id が重ならないよう、prefix を付けて 2 つの組織に 1 件ずつ入れる */
const seed = (prefix: string) =>
  insertInvoices([
    invoice({ id: `${prefix}-a`, ownerId: alice.id, orgId: orgId("org1") }),
    invoice({ id: `${prefix}-c`, ownerId: carol.id, orgId: orgId("org2") }),
  ]);

it("admin が触れるのは自分の組織の請求書だけ。他の組織のものは在ることも分からない", async () => {
  await seed("t1");
  const invoices = service();

  const page = await invoices.list(admin, { limit: 10 });
  expect(page.items.map((i) => i.id)).toEqual(["t1-a"]);

  expect(await invoices.get(admin, invoiceId("t1-c"))).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(await invoices.send(admin, invoiceId("t1-c"), now)).toEqual({
    ok: false,
    error: "NOT_FOUND",
  });
  expect(await invoices.remove(admin, invoiceId("t1-c"))).toEqual({
    ok: false,
    error: "NOT_FOUND",
  });
});

it("システムは全ての組織の請求書に触れる", async () => {
  await seed("t2");

  const page = await service().list(systemActor, { limit: 100 });
  const ids = page.items.map((i) => i.id);
  expect(ids).toContain("t2-a");
  expect(ids).toContain("t2-c");
});

it("作った請求書は作った人の組織のものになる", async () => {
  const created = await service().create(
    carol,
    {
      title: "t",
      body: "b",
      customerEmail: "c@example.com",
      dueAt: new Date("2026-02-01T00:00:00Z"),
      amount: 100,
    } as never,
    now,
  );

  expect(created.orgId).toBe("org2");
});

it("レポートは自分の組織の分だけ数える", async () => {
  await insertInvoices([
    invoice({
      id: "r1",
      orgId: orgId("org1"),
      status: "paid",
      amount: 1000,
      dueAt: new Date("2026-01-10T00:00:00Z"),
    }),
    invoice({
      id: "r2",
      ownerId: carol.id,
      orgId: orgId("org2"),
      status: "paid",
      amount: 7000,
      dueAt: new Date("2026-01-10T00:00:00Z"),
    }),
  ]);
  const payments = scopeTo(db(), paymentsTable);
  const paidAt = new Date("2026-01-12T00:00:00Z");
  await payments.insert({
    id: "rp1",
    invoiceId: "r1",
    amount: 1000,
    status: "succeeded",
    providerRef: "cs_r1",
    updatedAt: paidAt,
  });
  await payments.insert({
    id: "rp2",
    invoiceId: "r2",
    amount: 7000,
    status: "succeeded",
    providerRef: "cs_r2",
    updatedAt: paidAt,
  });

  const reports = reportsService(reportsRepository(db()));

  expect(await reports.monthly(admin, "2026-01", "2026-01")).toEqual({
    ok: true,
    value: [{ month: "2026-01", invoiced: 1000, received: 1000 }],
  });
  expect(await reports.monthly(admin2, "2026-01", "2026-01")).toEqual({
    ok: true,
    value: [{ month: "2026-01", invoiced: 7000, received: 7000 }],
  });
});
