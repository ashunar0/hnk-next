import { z } from "zod";

/**
 * 請求書というモノのルール。HTTP も DB も知らない。
 * フロントのフォームも、サーバーの service も、ここのルールを使う
 */

export const TITLE_MAX = 100;
export const BODY_MAX = 20000;

export const titleSchema = z
  .string()
  .trim()
  .min(1, "タイトルを入力してください")
  .max(TITLE_MAX, `タイトルは${TITLE_MAX}文字以内です`);

export const bodySchema = z
  .string()
  .min(1, "本文を入力してください")
  .max(BODY_MAX, `本文は${BODY_MAX}文字以内です`);

/**
 * 作成・更新で受け取る値。parse を通った値にだけ InvoiceInput の印が付く。
 * service はこの型しか受け取らないので、検査を飛ばして保存することが書けない
 */
export const invoiceInputSchema = z.object({ title: titleSchema, body: bodySchema }).brand<"InvoiceInput">();

export type InvoiceInput = z.infer<typeof invoiceInputSchema>;
