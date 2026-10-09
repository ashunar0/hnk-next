/**
 * 請求書というモノ。何であって、どんなルールを持つか（What）。
 * 手順も HTTP も DB も知らない。他のファイルは全部ここに向かう
 */
import { z } from "zod";
import type { Actor, OrgId, UserId } from "../users/domain";

/** 請求書の状態。下書き → 送付済み → 支払い済み */
export const invoiceStatuses = ["draft", "sent", "paid"] as const;

export type InvoiceStatus = (typeof invoiceStatuses)[number];

/** 請求した状態（送付済みか支払い済み）。集計の SQL もこの定数を使う */
export const billedStatuses = ["sent", "paid"] as const satisfies InvoiceStatus[];

/** まだ支払われていない、請求した状態。期限切れを探す SQL もこの定数を使う */
export const unpaidStatuses = ["sent"] as const satisfies InvoiceStatus[];

const isUnpaid = (status: InvoiceStatus) =>
  (unpaidStatuses as readonly InvoiceStatus[]).includes(status);

/**
 * 請求書の ID。ただの string と区別するための印。
 * 他の ID（利用者、組織）と取り違えると型エラーになる。印を付けられるのは下の invoiceId だけ
 */
declare const invoiceIdBrand: unique symbol;

export type InvoiceId = string & { readonly [invoiceIdBrand]: true };

/** 外から来た文字列、または DB から読んだ文字列に、請求書の ID の印を付ける。`as` を書くのはここだけ */
export const invoiceId = (value: string) => value as InvoiceId;

export const newInvoiceId = () => invoiceId(crypto.randomUUID());

/** 入力（URL やボディ）の ID。検査を通ると印が付く */
export const invoiceIdSchema = z.string().min(1).transform(invoiceId);

export type Invoice = {
  id: InvoiceId;
  /** 属する組織。作った人の組織で、変わらない */
  orgId: OrgId;
  ownerId: UserId;
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
    body: z.string().trim().min(1, "本文を入力してください").max(20000, "本文は20000文字以内です"),
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

/** 共有で渡せる権限。見るだけか、書き換えもできるか */
export const shareLevels = ["view", "edit"] as const;

export type ShareLevel = (typeof shareLevels)[number];

/**
 * その請求書に、操作する人がどの関係で触れているか。manage は所有者・組織の admin・システムで、
 * 書き換え・消す・共有するができる。edit と view は共有されたもの
 */
export type InvoiceAccess = "manage" | ShareLevel;

/**
 * 操作する人が触れる請求書の範囲。どの範囲も、組織をまたがない（all を除く）。
 * member は、自分のものと、自分に共有されたもの
 */
export type InvoiceReach =
  | { kind: "all" }
  | { kind: "org"; orgId: OrgId }
  | { kind: "member"; orgId: OrgId; userId: UserId };

/** システムは全組織に、admin は自分の組織の全員のものに、member は自分のものと共有されたものに触れる */
export const reachOf = (actor: Actor): InvoiceReach => {
  if (actor.kind === "system") return { kind: "all" };
  if (actor.role === "admin") return { kind: "org", orgId: actor.orgId };

  return { kind: "member", orgId: actor.orgId, userId: actor.id };
};

/** 書き換えられるのは、所有者側か、編集を共有されたもの */
export const canEdit = (access: InvoiceAccess) => access === "manage" || access === "edit";

/** 消す・共有するのは、所有者側だけ */
export const canManage = (access: InvoiceAccess) => access === "manage";

/** 送付できるのは admin だけ */
export const canSend = (actor: Actor) => actor.kind === "user" && actor.role === "admin";

/** 送付できるのは下書きだけ */
export const isSendable = (invoice: Invoice) => invoice.status === "draft";

/** 支払えるのは送付済みだけ */
export const isPayable = (invoice: Invoice) => isUnpaid(invoice.status);

/** 期限切れ: 送付済みのまま、期限を過ぎた */
export const isOverdue = (invoice: Invoice, now: Date) =>
  isUnpaid(invoice.status) && invoice.dueAt < now;

/** 督促してよい: 期限切れのものだけ */
export const isRemindable = isOverdue;
