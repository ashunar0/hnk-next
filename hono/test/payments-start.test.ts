import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { err, ok } from "hnk/result";
import { scopeTo } from "../api/db";
import { paymentsRepository, paymentsTable } from "../api/modules/payments/repo.d1";
import {
  paymentsService,
  type PayableInvoices,
  type PaymentGateway,
} from "../api/modules/payments/service";
import { alice, db, insertInvoices, invoice } from "./fixtures";

const payable: PayableInvoices = {
  async getPayable(id) {
    return ok({ id, title: "t", amount: 1200 });
  },
  async markPaid() {
    return ok(undefined);
  },
};

const gateway = (works: boolean): PaymentGateway => ({
  async createCheckout({ paymentId }) {
    return works
      ? ok({ checkoutUrl: "https://checkout.test/x", providerRef: `cs_${paymentId}` })
      : err("GATEWAY_FAILED");
  },
  async verifyEvent() {
    return ok(null);
  },
});

const paymentsOf = (invoiceId: string) =>
  db().select().from(paymentsTable).where(eq(paymentsTable.invoiceId, invoiceId));

it("先に pending を記録し、決済画面を作れたら識別子を結びつける", async () => {
  await insertInvoices([invoice({ id: "pay1", status: "sent" })]);
  const payments = paymentsService(
    paymentsRepository(scopeTo(db(), paymentsTable)),
    gateway(true),
    payable,
  );

  const result = await payments.start("pay1", alice);

  expect(result.ok).toBe(true);
  const [row] = await paymentsOf("pay1");
  expect(row).toMatchObject({ status: "pending", providerRef: `cs_${row!.id}`, amount: 1200 });
});

it("決済画面を作れなかったら、記録した支払いを失敗で閉じる", async () => {
  await insertInvoices([invoice({ id: "pay2", status: "sent" })]);
  const payments = paymentsService(
    paymentsRepository(scopeTo(db(), paymentsTable)),
    gateway(false),
    payable,
  );

  expect(await payments.start("pay2", alice)).toEqual({ ok: false, error: "GATEWAY_FAILED" });
  const rows = await paymentsOf("pay2");
  expect(rows.map((r) => [r.status, r.providerRef])).toEqual([["failed", null]]);
});
