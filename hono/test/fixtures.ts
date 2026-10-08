import { env } from "cloudflare:workers";
import { scopeTo, wireDb } from "../api/db";
import type { Invoice } from "../api/modules/invoices/domain";
import { invoicesTable } from "../api/modules/invoices/repo.d1";
import type { User } from "../api/modules/users/domain";

export const db = () => wireDb(env.DB);

export const alice: User = { kind: "user", id: "alice", role: "member" };
export const bob: User = { kind: "user", id: "bob", role: "member" };
export const admin: User = { kind: "user", id: "admin", role: "admin" };

/** 請求書を 1 件。テストで気にしない項目は既定値で埋める */
export const invoice = (over: Partial<Invoice> & Pick<Invoice, "id">): Invoice => ({
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
