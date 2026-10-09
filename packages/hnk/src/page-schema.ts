/**
 * 一覧のページ送りの、HTTP の入出力の形。スキーマのライブラリに依存しないよう、
 * Standard Schema を手で満たす（hnkSchema）。絞り込みや 1 件の形は、アプリのスキーマ（zod、valibot など）を包む
 */
import { PAGE_LIMIT, type Cursor, type Page } from "./page";
import {
  hnkSchema,
  issue,
  toJsonSchema,
  type InferInput,
  type InferOutput,
  type StandardSchema,
} from "./standard-schema";

/** 位置を、外からは中身の読めない文字列にする */
const encodeCursor = (cursor: Cursor) =>
  btoa(`${cursor.at.getTime()}:${cursor.id}`);

/** 文字列から位置を戻す。形が正しくなければ null */
const decodeCursor = (value: string): Cursor | null => {
  let decoded: string;
  try {
    decoded = atob(value);
  } catch {
    return null;
  }
  const at = decoded.indexOf(":");
  const ms = Number(decoded.slice(0, at));
  const id = decoded.slice(at + 1);
  if (at < 0 || !Number.isInteger(ms) || id === "") return null;

  return { at: new Date(ms), id };
};

/** query の値。Hono は同じ名前が複数あると配列で渡す */
type QueryValue = string | string[] | undefined;

/** ページ送りの部分の、受け取る形（query の文字列）と、handler に届く形 */
type PageQueryInput = { cursor?: string; limit?: string };
type PageQueryOutput = { cursor?: Cursor; limit: number };

const LIMIT_MESSAGE = `limit は 1 から ${PAGE_LIMIT.max} の整数で指定してください`;

/**
 * 一覧の query。絞り込みのスキーマを包み、cursor と limit を足す。
 * `request: { query: pageQuerySchema(z.object({ status: ... })) }`、絞り込みが無ければ `pageQuerySchema()`。
 * limit に既定（20）と上限（100）があるので、上限の無い一覧にならない
 */
export function pageQuerySchema(): StandardSchema<
  PageQueryInput,
  PageQueryOutput
>;
export function pageQuerySchema<F extends StandardSchema<any, any>>(
  filters: F,
): StandardSchema<
  InferInput<F> & PageQueryInput,
  InferOutput<F> & PageQueryOutput
>;
export function pageQuerySchema(
  filters?: StandardSchema<any, any>,
): StandardSchema<any, any> {
  return hnkSchema<unknown, Record<string, unknown> & PageQueryOutput>(
    async (value) => {
      const { cursor, limit, ...rest } = (value ?? {}) as Record<
        string,
        QueryValue
      >;

      const after =
        cursor === undefined
          ? undefined
          : typeof cursor === "string"
            ? decodeCursor(cursor)
            : null;
      if (after === null) return issue("cursor が正しくありません");

      const count = limit === undefined ? PAGE_LIMIT.default : Number(limit);
      if (
        typeof limit === "object" ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > PAGE_LIMIT.max
      )
        return issue(LIMIT_MESSAGE);

      const filtered = filters
        ? await filters["~standard"].validate(rest)
        : { value: {} };
      if (filtered.issues) return filtered;

      return {
        value: { ...filtered.value, cursor: after, limit: count },
      };
    },
    (io, options) => {
      const base = filters
        ? toJsonSchema(filters, io, options)
        : { type: "object", properties: {} };

      return {
        ...base,
        properties: {
          ...(base.properties as Record<string, unknown>),
          cursor: {
            type: "string",
            description: "続きを読む位置。前の応答の nextCursor",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: PAGE_LIMIT.max,
            default: PAGE_LIMIT.default,
          },
        },
      };
    },
  );
}

type PageBody<T> = { items: T[]; nextCursor: string | null };

/** 一覧の応答 `{ items, nextCursor }` の形。1 件の形はアプリのスキーマ。items の上限も持つ */
export const pageResponseSchema = <T extends StandardSchema<any, any>>(
  item: T,
) =>
  hnkSchema<PageBody<InferInput<T>>, PageBody<InferOutput<T>>>(
    async (value) => {
      const { items, nextCursor } = (value ?? {}) as Partial<PageBody<unknown>>;
      if (!Array.isArray(items) || items.length > PAGE_LIMIT.max)
        return issue(`items は ${PAGE_LIMIT.max} 件までの配列です`);
      if (nextCursor !== null && typeof nextCursor !== "string")
        return issue("nextCursor は文字列か null です");

      const checked: InferOutput<T>[] = [];
      for (const each of items) {
        const result = await item["~standard"].validate(each);
        if (result.issues) return result;
        checked.push(result.value);
      }

      return { value: { items: checked, nextCursor } };
    },
    (io, options) => ({
      type: "object",
      properties: {
        items: {
          type: "array",
          maxItems: PAGE_LIMIT.max,
          items: toJsonSchema(item, io, options),
        },
        /** 続きを読むときに cursor に渡す。続きが無ければ null */
        nextCursor: { type: ["string", "null"] },
      },
      required: ["items", "nextCursor"],
    }),
  );

/** Page → 応答。items は map で見せる形に詰め替える */
export const pageResponse = <T, R>(
  page: Page<T>,
  map: (item: T) => R,
): PageBody<R> => ({
  items: page.items.map(map),
  nextCursor: page.next ? encodeCursor(page.next) : null,
});
