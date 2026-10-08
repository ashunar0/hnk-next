import { hc } from "hono/client";
import type { ApiApp } from "./index";

const client = hc<ApiApp>("/");

export async function update() {
  const res = await client.invoices[":id"].$put({
    param: { id: "x" },
    json: { title: "t", body: "b", amount: 1000 },
  });

  if (res.status === 200) {
    const body = await res.json();
    body.title satisfies string;
  }
  if (res.status === 400) {
    const body = await res.json();
    body.error.code satisfies "VALIDATION_ERROR";
  }
  if (res.status === 401) {
    const body = await res.json();
    body.error.code satisfies "UNAUTHORIZED";
  }
  if (res.status === 404) {
    const body = await res.json();
    body.error.code satisfies "NOT_FOUND";
  }
  // @ts-expect-error 他人のものは NOT_FOUND に揃えたので 403 は出てこない
  if (res.status === 403) return;
  // @ts-expect-error 409 は宣言していないので比べられない
  if (res.status === 409) return;
}

export async function get() {
  const res = await client.invoices[":id"].$get({ param: { id: "x" } });

  // @ts-expect-error get は NOT_OWNER を宣言していないので 403 は出てこない
  if (res.status === 403) return;
}

export async function list() {
  const res = await client.invoices.$get({ query: { status: "sent", limit: "20" } });

  if (res.status === 200) {
    const body = await res.json();
    body.nextCursor satisfies string | null;
  }
  // 検索条件の検査があるので 400 が宣言される
  if (res.status === 400) return;
  // @ts-expect-error 一覧は 404 を宣言していない
  if (res.status === 404) return;

  // @ts-expect-error 状態は draft / sent / paid だけ
  await client.invoices.$get({ query: { status: "unknown" } });
}

export async function send() {
  const res = await client.invoices[":id"].send.$post({ param: { id: "x" } });

  if (res.status === 403) {
    const body = await res.json();
    body.error.code satisfies "FORBIDDEN";
  }
  if (res.status === 409) {
    const body = await res.json();
    body.error.code satisfies "NOT_DRAFT";
  }
  if (res.status === 200) {
    const body = await res.json();
    body.status satisfies "draft" | "sent" | "paid";
  }
}

export async function startPayment() {
  const res = await client.payments.$post({ json: { invoiceId: "x" } });

  if (res.status === 200) {
    const body = await res.json();
    body.checkoutUrl satisfies string;
  }
  if (res.status === 409) {
    const body = await res.json();
    body.error.code satisfies "NOT_PAYABLE";
  }
  if (res.status === 502) {
    const body = await res.json();
    body.error.code satisfies "GATEWAY_FAILED";
  }
}
