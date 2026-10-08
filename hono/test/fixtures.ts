import { env } from "cloudflare:workers";
import { scopeTo, wireDb } from "../api/db";
import type { Invoice } from "../api/modules/invoices/domain";
import {
  invoicesRepository,
  invoiceSharesTable,
  invoicesTable,
} from "../api/modules/invoices/repo.d1";
import { authenticatedUser } from "../api/modules/users/domain";

export const db = () => wireDb(env.DB);

/** 本物の D1 に繋いだ invoices の repo */
export const invoicesRepo = () =>
  invoicesRepository(scopeTo(db(), invoicesTable), scopeTo(db(), invoiceSharesTable));

export const alice = authenticatedUser("alice", "org1", "member");
export const bob = authenticatedUser("bob", "org1", "member");
export const admin = authenticatedUser("admin", "org1", "admin");
/** 別の組織の人たち */
export const carol = authenticatedUser("carol", "org2", "member");
export const admin2 = authenticatedUser("admin2", "org2", "admin");

/** 請求書を 1 件。テストで気にしない項目は既定値で埋める */
export const invoice = (over: Partial<Invoice> & Pick<Invoice, "id">): Invoice => ({
  orgId: alice.orgId,
  ownerId: alice.id,
  title: `title ${over.id}`,
  body: "body",
  amount: 1000,
  customerEmail: "customer@example.com",
  dueAt: new Date("2026-01-31T00:00:00Z"),
  status: "draft",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

export const insertInvoices = async (invoices: Invoice[]) => {
  await scopeTo(db(), invoicesTable).insert(invoices[0]!);
  for (const row of invoices.slice(1)) await scopeTo(db(), invoicesTable).insert(row);
};
