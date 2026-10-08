/**
 * 請求書というモノ。何であって、どんなルールを持つか（What）。
 * 手順も HTTP も DB も知らない。他のファイルは全部ここに向かう
 */
import { z } from "zod";
import type { Viewer } from "../users/domain";

/** 請求書の状態。下書き → 送付済み → 支払い済み */
export const invoiceStatuses = ["draft", "sent", "paid"] as const;

export type InvoiceStatus = (typeof invoiceStatuses)[number];

/** 請求した状態（送付済みか支払い済み）。集計の SQL もこの定数を使う */
export const billedStatuses = ["sent", "paid"] as const satisfies InvoiceStatus[];

/** まだ支払われていない、請求した状態。期限切れを探す SQL もこの定数を使う */
export const unpaidStatuses = ["sent"] as const satisfies InvoiceStatus[];

const isUnpaid = (status: InvoiceStatus) =>
  (unpaidStatuses as readonly InvoiceStatus[]).includes(status);

export type Invoice = {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  /** 請求額（円） */
  amount: number;
  /** 請求先のメールアドレス */
  customerEmail: string;
  /** 支払いの期限 */
  dueAt: Date;
  status: InvoiceStatus;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * ルール。フロントのフォームもここを使う。
 * 検査を通った値にだけ InvoiceInput の印が付く。service はこの型しか受け取らないので、
 * どの入口から呼んでも、検査を飛ばして保存することが書けない
 */
export const invoiceInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "タイトルを入力してください")
      .max(100, "タイトルは100文字以内です"),
    body: z.string().min(1, "本文を入力してください").max(20000, "本文は20000文字以内です"),
    customerEmail: z.email("メールアドレスの形で入力してください"),
    dueAt: z.coerce.date("期限を日付で入力してください"),
    amount: z
      .number()
      .int("金額は円単位の整数で入力してください")
      .min(1, "金額を入力してください")
      .max(10_000_000, "金額は1000万円以下です"),
  })
  .brand<"InvoiceInput">();

/** 作成・更新で受け取る値。検査済みの印付き */
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

/** 書き換えてよいもの。id や ownerId は変えられない */
export type InvoiceChanges = Partial<
  Pick<Invoice, "title" | "body" | "amount" | "customerEmail" | "dueAt" | "status">
> &
  Pick<Invoice, "updatedAt">;

/** 閲覧者が触れる請求書の範囲 */
export type InvoiceReach = { kind: "all" } | { kind: "own"; ownerId: string };

/** admin とシステムは全員のものに、member は自分のものだけに触れる */
export const reachOf = (viewer: Viewer): InvoiceReach =>
  viewer.kind === "system" || viewer.role === "admin"
    ? { kind: "all" }
    : { kind: "own", ownerId: viewer.id };

/** 送付できるのは admin だけ */
export const canSend = (viewer: Viewer) => viewer.kind === "user" && viewer.role === "admin";

/** 送付できるのは下書きだけ */
export const isSendable = (invoice: Invoice) => invoice.status === "draft";

/** 支払えるのは送付済みだけ */
export const isPayable = (invoice: Invoice) => isUnpaid(invoice.status);

/** 期限切れ: 送付済みのまま、期限を過ぎた */
export const isOverdue = (invoice: Invoice, now: Date) =>
  isUnpaid(invoice.status) && invoice.dueAt < now;

/** 督促してよい: 期限切れのものだけ */
export const isRemindable = isOverdue;
