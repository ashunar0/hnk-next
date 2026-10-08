import { invoiceInputSchema } from "./domain";
import { systemViewer, type User } from "../users/domain";
import type { InvoicesService } from "./service";

// HTTP を通らずに service を呼ぶ場面（cron、CSV の取り込みなど）
export async function fromCron(invoices: InvoicesService, viewer: User, raw: unknown) {
  // @ts-expect-error 検査を通っていない値は渡せない
  await invoices.create(viewer, {
    title: "t",
    body: "b",
    amount: 1000,
    customerEmail: "a@example.com",
    dueAt: new Date(),
  });

  // 検査を通せば渡せる
  await invoices.create(viewer, invoiceInputSchema.parse(raw));

  // Result で受けたいときは safeParse
  const parsed = invoiceInputSchema.safeParse(raw);
  if (parsed.success) await invoices.create(viewer, parsed.data);
}

// システムは利用者ではないので、請求書の所有者になれない
export async function systemCannotCreate(invoices: InvoicesService, raw: unknown) {
  // @ts-expect-error create が受け取るのは User だけ
  await invoices.create(systemViewer, invoiceInputSchema.parse(raw));
}
