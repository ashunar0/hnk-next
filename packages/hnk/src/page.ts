/**
 * 一覧のページ送り（キーセット）。並びは「時刻 + id」で決まり、続きは位置（Cursor）で指す。
 * 一覧は必ず PageQuery を受け取り、Page を返す——上限の無い一覧を書く道を作らない。
 * 型と、純粋な関数だけ。zod と HTTP の部分は hnk 本体にある
 */

/** 一覧の中の位置。並びを決める時刻と id。同じ時刻が複数あっても、id で一意になる */
export type Cursor = { at: Date; id: string };

/** 一覧の条件。limit は必須で、上限は PAGE_LIMIT.max */
export type PageQuery = {
  /** この位置より後ろから */
  after?: Cursor;
  limit: number;
};

/** 一覧の 1 ページ。続きが無ければ next は null */
export type Page<T> = {
  items: T[];
  next: Cursor | null;
};

export const PAGE_LIMIT = { default: 20, max: 100 } as const;

/**
 * 「limit + 1 件」読んだ行から、1 ページを作る。
 * 1 件多く読むのは、続きがあるかを知るため。repo は `.limit(limit + 1)` で読んで、これに渡す
 */
export const toPage = <T>(
  rows: T[],
  limit: number,
  cursorOf: (item: T) => Cursor,
): Page<T> => {
  const items = rows.slice(0, limit);
  const last = items.at(-1);

  return { items, next: rows.length > limit && last ? cursorOf(last) : null };
};
