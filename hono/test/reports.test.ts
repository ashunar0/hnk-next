import { expect, it } from "vitest";
import { scopeTo } from "../api/db";
import { paymentsTable } from "../api/modules/payments/repo.d1";
import { reportsRepository } from "../api/modules/reports/repo.d1";
import { reportsService } from "../api/modules/reports/service";
import { admin, alice, db, insertInvoices, invoice } from "./fixtures";

it("月ごとの請求額と入金額。データの無い月は 0、下書きと失敗した支払いは数えない", async () => {
  await insertInvoices([
    invoice({
      id: "jan-sent",
      status: "sent",
      amount: 1000,
      dueAt: new Date("2026-01-10T00:00:00Z"),
    }),
    invoice({
      id: "jan-paid",
      status: "paid",
      amount: 2000,
      dueAt: new Date("2026-01-31T23:59:59Z"),
    }),
    invoice({
      id: "jan-draft",
      status: "draft",
      amount: 9999,
      dueAt: new Date("2026-01-20T00:00:00Z"),
    }),
    invoice({
      id: "feb-sent",
      status: "sent",
      amount: 500,
      dueAt: new Date("2026-02-01T00:00:00Z"),
    }),
  ]);
  const payments = scopeTo(db(), paymentsTable);
  await payments.insert({
    id: "p1",
    invoiceId: "jan-paid",
    amount: 2000,
    status: "succeeded",
    providerRef: "cs_1",
    updatedAt: new Date("2026-02-03T00:00:00Z"),
  });
  await payments.insert({
    id: "p2",
    invoiceId: "feb-sent",
    amount: 500,
    status: "failed",
    providerRef: "cs_2",
    updatedAt: new Date("2026-02-04T00:00:00Z"),
  });

  const reports = reportsService(reportsRepository(db()));
  const result = await reports.monthly(admin, "2026-01", "2026-03");

  expect(result).toEqual({
    ok: true,
    value: [
      { month: "2026-01", invoiced: 3000, received: 0 },
      { month: "2026-02", invoiced: 500, received: 2000 },
      { month: "2026-03", invoiced: 0, received: 0 },
    ],
  });

  // member は見られない
  expect(await reports.monthly(alice, "2026-01", "2026-03")).toEqual({
    ok: false,
    error: "FORBIDDEN",
  });
});
