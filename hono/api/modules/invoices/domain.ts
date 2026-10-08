/**
 * 請求書というモノ。何であって、どんなルールを持つか（What）。
 * 手順も HTTP も DB も知らない。他のファイルは全部ここに向かう
 */
import { z } from "zod";
import type { Viewer } from "../users/domain";

/** 請求書の状態。下書き → 送付済み → 支払い済み */
export const invoiceStatuses = ["draft", "sent", "paid"] as const;

export type InvoiceStatus = (typeof invoiceStatuses)[number];

export type Invoice = {
  id: string;
  ownerId: string;
  title: string;
  body: string;
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
  })
  .brand<"InvoiceInput">();

/** 作成・更新で受け取る値。検査済みの印付き */
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

/** 書き換えてよいもの。id や ownerId は変えられない */
export type InvoiceChanges = Partial<Pick<Invoice, "title" | "body" | "status">> &
  Pick<Invoice, "updatedAt">;

/** 閲覧者が触れる請求書の範囲 */
export type InvoiceReach = { kind: "all" } | { kind: "own"; ownerId: string };

/** admin は全員のものに、member は自分のものだけに触れる */
export const reachOf = (viewer: Viewer): InvoiceReach =>
  viewer.role === "admin" ? { kind: "all" } : { kind: "own", ownerId: viewer.id };

/** 送付できるのは admin だけ */
export const canSend = (viewer: Viewer) => viewer.role === "admin";

/** 送付できるのは下書きだけ */
export const isSendable = (invoice: Invoice) => invoice.status === "draft";
