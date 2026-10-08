import { invoiceInputSchema } from "./domain";
import type { Viewer } from "../users/domain";
import type { InvoicesService } from "./service";

// HTTP を通らずに service を呼ぶ場面（cron、CSV の取り込みなど）
export async function fromCron(invoices: InvoicesService, viewer: Viewer, raw: unknown) {
  // @ts-expect-error 検査を通っていない値は渡せない
  await invoices.create(viewer, { title: "t", body: "b", amount: 1000 });

  // 検査を通せば渡せる
  await invoices.create(viewer, invoiceInputSchema.parse(raw));

  // Result で受けたいときは safeParse
  const parsed = invoiceInputSchema.safeParse(raw);
  if (parsed.success) await invoices.create(viewer, parsed.data);
}
