import { hc } from "hono/client";
import type { ApiApp } from "./index";

const client = hc<ApiApp>("/");

export async function update() {
  const res = await client.invoices[":id"].$put({
    param: { id: "x" },
    json: { title: "t", body: "b" },
  });

  if (res.status === 200) {
    const body = await res.json();
    body.title satisfies string;
  }
  if (res.status === 404) {
    const body = await res.json();
    body.error.code satisfies "NOT_FOUND";
  }
  if (res.status === 403) {
    const body = await res.json();
    body.error.code satisfies "NOT_OWNER";
  }
  // @ts-expect-error 409 は返りえないので比べられない
  if (res.status === 409) return;
}

export async function get() {
  const res = await client.invoices[":id"].$get({ param: { id: "x" } });

  // @ts-expect-error get は NOT_OWNER を返さないので 403 は出てこない
  if (res.status === 403) return;
}

export async function list() {
  const res = await client.invoices.$get();

  // @ts-expect-error 一覧は失敗を返さない
  if (res.status === 404) return;
}
