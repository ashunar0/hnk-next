import { expect, it } from "vitest";
import { admin, alice, bob, carol, request } from "./fixtures";

const input = {
  title: "請求書",
  body: "本文",
  amount: 1000,
  customerEmail: "c@example.com",
  dueAt: "2026-02-01",
};

const json = async (res: Response) => (await res.json()) as Record<string, any>;

/** alice が請求書を 1 件作り、その id を返す */
const create = async () => {
  const res = await request(alice, "POST", "/invoices", input);
  expect(res.status).toBe(200);

  return (await json(res)).id as string;
};

it("作って、読めて、一覧に出る。入力が正しくなければ 400", async () => {
  const id = await create();

  const got = await request(alice, "GET", `/invoices/${id}`);
  expect(got.status).toBe(200);
  expect((await json(got)).title).toBe("請求書");

  const list = await json(await request(alice, "GET", "/invoices?limit=100"));
  expect(list.items.map((i: { id: string }) => i.id)).toContain(id);

  const bad = await request(alice, "POST", "/invoices", { ...input, title: "" });
  expect(bad.status).toBe(400);
  expect((await json(bad)).error.code).toBe("VALIDATION_ERROR");
});

it("共有されていない人には 404、閲覧を共有されると読めるが書き換えは 403", async () => {
  const id = await create();

  expect((await request(bob, "GET", `/invoices/${id}`)).status).toBe(404);

  const shared = await request(alice, "PUT", `/invoices/${id}/shares`, {
    userId: bob.id,
    level: "view",
  });
  expect(shared.status).toBe(200);

  expect((await request(bob, "GET", `/invoices/${id}`)).status).toBe(200);
  const put = await request(bob, "PUT", `/invoices/${id}`, input);
  expect(put.status).toBe(403);
  expect((await json(put)).error.code).toBe("FORBIDDEN");
  expect((await request(bob, "DELETE", `/invoices/${id}`)).status).toBe(403);
  expect(
    (await request(bob, "PUT", `/invoices/${id}/shares`, { userId: "x", level: "view" })).status,
  ).toBe(403);

  // 共有をやめると、また見えない
  expect((await request(alice, "DELETE", `/invoices/${id}/shares/${bob.id}`)).status).toBe(200);
  expect((await request(bob, "GET", `/invoices/${id}`)).status).toBe(404);
});

it("他の組織の人には、admin でも 404。送付できるのは自分の組織の admin だけ", async () => {
  const id = await create();

  expect((await request(carol, "GET", `/invoices/${id}`)).status).toBe(404);
  expect((await request(alice, "POST", `/invoices/${id}/send`)).status).toBe(403);

  const sent = await request(admin, "POST", `/invoices/${id}/send`);
  expect(sent.status).toBe(200);
  expect((await json(sent)).status).toBe("sent");
});

it("ログインしていなければ 401", async () => {
  expect((await request(null, "GET", "/invoices")).status).toBe(401);
});
