import { invoiceInputSchema } from "@contract/invoices/model";
import type { InvoicesService } from "./service";

// HTTP を通らずに service を呼ぶ場面（cron、CSV の取り込みなど）
export async function fromCron(invoices: InvoicesService, ownerId: string, raw: unknown) {
  // @ts-expect-error 検査を通っていない値は渡せない
  await invoices.create(ownerId, { title: "", body: "" });

  // 検査を通せば渡せる
  await invoices.create(ownerId, invoiceInputSchema.parse(raw));

  // Result で受けたいときは safeParse
  const parsed = invoiceInputSchema.safeParse(raw);
  if (parsed.success) await invoices.create(ownerId, parsed.data);
}
