import { orgId, userId } from "../api/modules/users/domain";
import { beforeAll, describe, expect, it } from "vitest";
import { scopeTo } from "../api/db";
import type { InvoiceReach } from "../api/modules/invoices/domain";
import { paymentsTable } from "../api/modules/payments/repo.d1";
import { db, insertInvoices, invoice } from "./fixtures";

/**
 * 他の module に公開している読み（〜Within）の契約。
 * repo の export から名前で拾うので、読みを足すと登録しなくても自動でここに入る。
 * 足した読みの表に行が無いと「空では確かめられない」で落ちるので、下の seed に足す
 */
const modules = import.meta.glob("../api/modules/*/repo.*.ts", { eager: true });

type Read = (db: ReturnType<typeof import("./fixtures").db>, reach: InvoiceReach) => never;

const reads = Object.entries(modules).flatMap(([path, exports]) =>
  Object.entries(exports)
    .filter(([name, value]) => name.endsWith("Within") && typeof value === "function")
    .map(([name, value]) => ({ name: `${path.split("/")[3]}/${name}`, read: value as Read })),
);

/** 組織 1 の alice と bob、組織 2 の carol。支払いは請求書ごとに 1 件 */
beforeAll(async () => {
  await insertInvoices([
    invoice({ id: "ct1-alice", orgId: orgId("org1"), ownerId: userId("alice"), status: "sent" }),
    invoice({ id: "ct1-bob", orgId: orgId("org1"), ownerId: userId("bob"), status: "sent" }),
    invoice({ id: "ct2-carol", orgId: orgId("org2"), ownerId: userId("carol"), status: "sent" }),
  ]);
  const payments = scopeTo(db(), paymentsTable);
  for (const id of ["ct1-alice", "ct1-bob", "ct2-carol"]) {
    await payments.insert({ id: `pay-${id}`, invoiceId: id, amount: 1000, status: "succeeded" });
  }
});

it("公開している読みが 1 つ以上ある", () => {
  expect(reads.length).toBeGreaterThan(0);
});

describe.each(reads)("$name", ({ read }) => {
  const rows = async (reach: InvoiceReach) =>
    JSON.stringify(await db().select().from(read(db(), reach)));

  it("組織の範囲では、自分の組織のものだけが出る", async () => {
    const result = await rows({ kind: "org", orgId: orgId("org1") });

    expect(result).toContain("ct1-alice");
    expect(result).toContain("ct1-bob");
    expect(result).not.toContain("ct2-");
  });

  it("自分の範囲では、自分のものだけが出る", async () => {
    const result = await rows({ kind: "member", orgId: orgId("org1"), userId: userId("alice") });

    expect(result).toContain("ct1-alice");
    expect(result).not.toContain("ct1-bob");
    expect(result).not.toContain("ct2-");
  });
});
