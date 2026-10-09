/**
 * note というモノ。何であって、どんなルールを持つか（What）。
 * 手順も HTTP も DB も知らない。他のファイルは全部ここに向かう
 */
import { z } from "zod";
import type { Actor, OrgId, UserId } from "../users/domain";

/**
 * note の ID。ただの string と区別するための印。
 * 他の ID（利用者、組織）と取り違えると型エラーになる。印を付けられるのは下の noteId だけ
 */
declare const noteIdBrand: unique symbol;

export type NoteId = string & { readonly [noteIdBrand]: true };

/** 外から来た文字列、または DB から読んだ文字列に、note の ID の印を付ける。`as` を書くのはここだけ */
export const noteId = (value: string) => value as NoteId;

export const newNoteId = () => noteId(crypto.randomUUID());

/** 入力（URL やボディ）の ID。検査を通ると印が付く */
export const noteIdSchema = z.string().min(1).transform(noteId);

export type Note = {
  id: NoteId;
  /** 属する組織。作った人の組織で、変わらない */
  orgId: OrgId;
  ownerId: UserId;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * ルール。フロントのフォームもここを使う。
 * 検査を通った値にだけ NoteInput の印が付く。service はこの型しか受け取らないので、
 * どの入口から呼んでも、検査を飛ばして保存することが書けない
 */
export const noteInputSchema = z
  .object({
    title: z.string().trim().min(1, "タイトルを入力してください").max(100, "タイトルは100文字以内です"),
    body: z.string().trim().min(1, "本文を入力してください").max(20000, "本文は20000文字以内です"),
  })
  .brand<"NoteInput">();

/** 作成・更新で受け取る値。検査済みの印付き */
export type NoteInput = z.infer<typeof noteInputSchema>;

/** 書き換えてよいもの。id や ownerId は変えられない */
export type NoteChanges = Partial<Pick<Note, "title" | "body">> & Pick<Note, "updatedAt">;

/**
 * 操作する人が触れる notes の範囲。どの範囲も、組織をまたがない（all を除く）。
 * member は自分のものだけ
 */
export type NoteReach =
  | { kind: "all" }
  | { kind: "org"; orgId: OrgId }
  | { kind: "member"; orgId: OrgId; userId: UserId };

/** システムは全組織に、admin は自分の組織の全員のものに、member は自分のものに触れる */
export const reachOf = (actor: Actor): NoteReach => {
  if (actor.kind === "system") return { kind: "all" };
  if (actor.role === "admin") return { kind: "org", orgId: actor.orgId };

  return { kind: "member", orgId: actor.orgId, userId: actor.id };
};
