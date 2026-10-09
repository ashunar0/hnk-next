import { z } from "zod";

import { PAGE_LIMIT, type Cursor, type Page } from "./page";

/** 位置を、外からは中身の読めない文字列にする */
export const encodeCursor = (cursor: Cursor) =>
  btoa(`${cursor.at.getTime()}:${cursor.id}`);

/** 文字列から位置を戻す。形が正しくなければ検査の失敗にする */
export const cursorSchema = z.string().transform((value, ctx) => {
  const decoded = (() => {
    try {
      return atob(value);
    } catch {
      return "";
    }
  })();
  const at = decoded.indexOf(":");
  const ms = Number(decoded.slice(0, at));
  const id = decoded.slice(at + 1);
  if (at < 0 || !Number.isInteger(ms) || id === "") {
    ctx.addIssue({ code: "custom", message: "cursor が正しくありません" });
    return z.NEVER;
  }

  return { at: new Date(ms), id } satisfies Cursor;
});

/**
 * 一覧の query に展開する。`z.object({ status: ..., ...pageQuery })`。
 * limit に既定と上限があるので、上限の無い一覧にならない
 */
export const pageQuery = {
  cursor: cursorSchema.optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGE_LIMIT.max)
    .default(PAGE_LIMIT.default),
};

/** 一覧の応答 `{ items, nextCursor }` の形。items の上限も持つ */
export const pageResponseSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item).max(PAGE_LIMIT.max),
    /** 続きを読むときに cursor に渡す。続きが無ければ null */
    nextCursor: z.string().nullable(),
  });

/** Page → 応答。items は map で見せる形に詰め替える */
export const pageResponse = <T, R>(page: Page<T>, map: (item: T) => R) => ({
  items: page.items.map(map),
  nextCursor: page.next ? encodeCursor(page.next) : null,
});
