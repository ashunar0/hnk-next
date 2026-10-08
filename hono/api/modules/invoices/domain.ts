/**
 * 請求書というモノ。何であって、どんなルールを持つか（What）。
 * 手順も HTTP も DB も知らない。他のファイルは全部ここに向かう
 */
import { z } from "zod";

export type Invoice = {
  id: string;
  ownerId: string;
  title: string;
  body: string;
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
export type InvoiceChanges = Pick<Invoice, "title" | "body" | "updatedAt">;
