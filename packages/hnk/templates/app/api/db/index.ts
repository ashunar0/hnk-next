import type { InferInsertModel } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

/** データベースドライバを名指しする、このプロジェクトで唯一の場所 */
export const wireDb = (binding: D1Database) => drizzle(binding);

export type Db = ReturnType<typeof wireDb>;

/** 読みだけの db。他 module の table も読める（join のため） */
export type ReadDb = Pick<Db, "select">;

/**
 * この module が触れる範囲だけを取り出す。
 *
 * 読みは越境してよく、書きはこの table に限る——規約の非対称性がそのまま型になる。
 * repository に db を渡さないので、他 module の table への書き込みは書きようがない
 */
export const scopeTo = <T extends SQLiteTable>(db: Db, table: T) => ({
  reads: db as ReadDb,
  insert: (values: InferInsertModel<T>) => db.insert(table).values(values),
  update: (values: Partial<InferInsertModel<T>>) => db.update(table).set(values),
  delete: () => db.delete(table),
});

export type Scope<T extends SQLiteTable> = ReturnType<typeof scopeTo<T>>;
