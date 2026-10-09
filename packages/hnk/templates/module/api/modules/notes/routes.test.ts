import { expect, it } from "vitest";
import { admin, alice, bob, carol, request } from "../../../test/fixtures";

const input = { title: "題名", body: "本文" };

const json = async (res: Response) => (await res.json()) as Record<string, any>;

/** alice が note を 1 件作り、その id を返す */
const create = async () => {
  const res = await request(alice, "POST", "/__kebab__", input);
  expect(res.status).toBe(200);

  return (await json(res)).id as string;
};

it("作って、読めて、一覧に出る。入力が正しくなければ 400", async () => {
  const id = await create();

  const got = await request(alice, "GET", `/__kebab__/${id}`);
  expect(got.status).toBe(200);
  expect((await json(got)).title).toBe("題名");

  const list = await json(await request(alice, "GET", "/__kebab__?limit=100"));
  expect(list.items.map((item: { id: string }) => item.id)).toContain(id);

  const bad = await request(alice, "POST", "/__kebab__", { ...input, title: "" });
  expect(bad.status).toBe(400);
  expect((await json(bad)).error.code).toBe("VALIDATION_ERROR");
});

it("更新して、消せる。消した後は 404", async () => {
  const id = await create();

  const put = await request(alice, "PUT", `/__kebab__/${id}`, { ...input, title: "新しい題名" });
  expect(put.status).toBe(200);
  expect((await json(put)).title).toBe("新しい題名");

  expect((await request(alice, "DELETE", `/__kebab__/${id}`)).status).toBe(200);
  expect((await request(alice, "GET", `/__kebab__/${id}`)).status).toBe(404);
});

it("同じ組織の別の人には 404、組織の admin には見える。他の組織には admin でも 404", async () => {
  const id = await create();

  expect((await request(bob, "GET", `/__kebab__/${id}`)).status).toBe(404);
  expect((await request(admin, "GET", `/__kebab__/${id}`)).status).toBe(200);
  expect((await request(carol, "GET", `/__kebab__/${id}`)).status).toBe(404);
});

it("ログインしていなければ 401", async () => {
  expect((await request(null, "GET", "/__kebab__")).status).toBe(401);
});
