import { invoiceId } from "../api/modules/invoices/domain";
import { expect, it } from "vitest";
import { invoicesService } from "../api/modules/invoices/service";
import { authenticatedUser } from "../api/modules/users/domain";
import { admin, alice, bob, carol, insertInvoices, invoice, invoicesRepo } from "./fixtures";

const service = () => invoicesService(invoicesRepo());

const input = {
  title: "新しいタイトル",
  body: "b",
  customerEmail: "c@example.com",
  dueAt: new Date("2026-02-01T00:00:00Z"),
  amount: 100,
} as never;

/** alice の請求書 1 件を、テストごとに別の id で入れる */
const seed = (id: string) => insertInvoices([invoice({ id, ownerId: alice.id, orgId: "org1" })]);

const ids = async (viewer: Parameters<ReturnType<typeof service>["list"]>[0]) =>
  (await service().list(viewer, { limit: 100 })).items.map((i) => i.id);

it("共有されていなければ、同じ組織の member にも見えない", async () => {
  await seed("s1");

  expect(await service().get(invoiceId("s1"), bob)).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(await ids(bob)).not.toContain("s1");
});

it("閲覧を共有された人は、見られるが、書き換えも削除も共有もできない", async () => {
  await seed("s2");
  expect(await service().share(invoiceId("s2"), alice, bob.id, "view")).toEqual({
    ok: true,
    value: undefined,
  });

  expect((await service().get(invoiceId("s2"), bob)).ok).toBe(true);
  expect(await ids(bob)).toContain("s2");
  expect(await service().update(invoiceId("s2"), bob, input)).toEqual({
    ok: false,
    error: "FORBIDDEN",
  });
  expect(await service().remove(invoiceId("s2"), bob)).toEqual({ ok: false, error: "FORBIDDEN" });
  expect(await service().share(invoiceId("s2"), bob, "dave", "view")).toEqual({
    ok: false,
    error: "FORBIDDEN",
  });
});

it("編集を共有された人は、書き換えられるが、削除と共有はできない", async () => {
  await seed("s3");
  await service().share(invoiceId("s3"), alice, bob.id, "edit");

  const updated = await service().update(invoiceId("s3"), bob, input);
  expect(updated.ok && updated.value.title).toBe("新しいタイトル");
  expect(await service().remove(invoiceId("s3"), bob)).toEqual({ ok: false, error: "FORBIDDEN" });
});

it("共有の権限は置き換えられ、やめると見えなくなる", async () => {
  await seed("s4");
  await service().share(invoiceId("s4"), alice, bob.id, "edit");
  await service().share(invoiceId("s4"), alice, bob.id, "view");
  expect(await service().update(invoiceId("s4"), bob, input)).toEqual({
    ok: false,
    error: "FORBIDDEN",
  });

  await service().unshare(invoiceId("s4"), alice, bob.id);
  expect(await service().get(invoiceId("s4"), bob)).toEqual({ ok: false, error: "NOT_FOUND" });
});

it("共有できるのは所有者と組織の admin。見えない人には在ることも分からない", async () => {
  await seed("s5");

  expect(await service().share(invoiceId("s5"), bob, "dave", "view")).toEqual({
    ok: false,
    error: "NOT_FOUND",
  });
  expect(await service().share(invoiceId("s5"), admin, bob.id, "view")).toEqual({
    ok: true,
    value: undefined,
  });
  expect((await service().get(invoiceId("s5"), bob)).ok).toBe(true);
});

it("違う組織の人に共有しても、その人には見えない", async () => {
  await seed("s6");
  await service().share(invoiceId("s6"), alice, carol.id, "edit");

  expect(await service().get(invoiceId("s6"), carol)).toEqual({ ok: false, error: "NOT_FOUND" });
  expect(await service().update(invoiceId("s6"), carol, input)).toEqual({
    ok: false,
    error: "NOT_FOUND",
  });
  // 同じ id の人が組織を移っても、組織の線は越えない
  const carolInOrg1 = authenticatedUser(carol.id, "org1", "member");
  expect((await service().get(invoiceId("s6"), carolInOrg1)).ok).toBe(true);
});

it("所有者は共有されていなくても、自分のものを自由に扱える", async () => {
  await seed("s7");

  expect((await service().update(invoiceId("s7"), alice, input)).ok).toBe(true);
  expect((await service().remove(invoiceId("s7"), alice)).ok).toBe(true);
});
