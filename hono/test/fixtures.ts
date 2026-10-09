import { env } from "cloudflare:workers";
import { scopeTo, wireDb } from "../api/db";
import { invoiceId, type Invoice } from "../api/modules/invoices/domain";
import {
  invoicesRepository,
  invoiceSharesTable,
  invoicesTable,
} from "../api/modules/invoices/repo.d1";
import { makeDeps } from "../api/deps";
import { buildApp } from "../api/index";
import { authenticatedUser, type User } from "../api/modules/users/domain";

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
export const invoice = (over: Omit<Partial<Invoice>, "id"> & { id: string }): Invoice => ({
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
  id: invoiceId(over.id),
});

export const insertInvoices = async (invoices: Invoice[]) => {
  await scopeTo(db(), invoicesTable).insert(invoices[0]!);
  for (const row of invoices.slice(1)) await scopeTo(db(), invoicesTable).insert(row);
};

/**
 * この利用者としてログインした状態のアプリ（本物の deps と D1）。
 * null ならログインしていない。認証の提供元の代わりに viewer を積むだけで、あとは本番と同じ
 */
export const appAs = (user: User | null) =>
  buildApp(makeDeps, async (c, next) => {
    c.set("viewer", user);
    await next();
  });

/** appAs で JSON を送る。env は本物の D1 を指す */
export const request = (user: User | null, method: string, path: string, body?: unknown) =>
  appAs(user).request(
    path,
    {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
