/**
 * notes の保存。service.ts が宣言した NotesRepository を、D1 で満たす。
 * 行の形はこのファイルの外に出さず、domain の Note に詰め替えて返す
 */
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { toPage } from "hnk/page";
import type { Scope } from "../../db";
import { orgId, userId } from "../users/domain";
import { noteId, type Note, type NoteReach } from "./domain";
import type { NotesRepository } from "./service";

/** 列の既定値: 今の時刻（ミリ秒）。SQL の式で、JS の Date ではない */
const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/** note。組織と所有者を持つ */
export const notesTable = sqliteTable(
  "__snake__",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    /** 所有者の利用者 id。利用者の表がまだ無い（認証の提供元を決めたら外部キーを張る）ので、外部キーは無い */
    ownerId: text("owner_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
  },
  (table) => [
    // 一覧の並び（自分のもの、更新の新しい順）をそのまま辿る
    index("__snake___owner_updated_idx").on(table.orgId, table.ownerId, table.updatedAt, table.id),
    // admin が組織の全員のものを見るときの並び
    index("__snake___org_updated_idx").on(table.orgId, table.updatedAt, table.id),
  ],
);

type NoteRow = typeof notesTable.$inferSelect;

/** 行 → モノ。今は同じ形だが、列が増えても domain に漏らさないための関所 */
const toNote = (row: NoteRow): Note => ({
  id: noteId(row.id),
  orgId: orgId(row.orgId),
  ownerId: userId(row.ownerId),
  title: row.title,
  body: row.body,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** 範囲を WHERE の条件にする。all なら絞らない */
const within = (reach: NoteReach) => {
  switch (reach.kind) {
    case "all":
      return undefined;
    case "org":
      return eq(notesTable.orgId, reach.orgId);
    case "member":
      return and(eq(notesTable.orgId, reach.orgId), eq(notesTable.ownerId, reach.userId));
  }
};

export function notesRepository(scope: Scope<typeof notesTable>): NotesRepository {
  return {
    async listWithin(reach, { after, limit }) {
      // 1 件多く読んで、続きがあるかを知る
      const rows = await scope.reads
        .select()
        .from(notesTable)
        .where(
          and(
            within(reach),
            after
              ? or(
                  lt(notesTable.updatedAt, after.at),
                  and(eq(notesTable.updatedAt, after.at), lt(notesTable.id, after.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(notesTable.updatedAt), desc(notesTable.id))
        .limit(limit + 1);

      return toPage(rows.map(toNote), limit, (note) => ({ at: note.updatedAt, id: note.id }));
    },

    async findWithin(id, reach) {
      const [row] = await scope.reads
        .select()
        .from(notesTable)
        .where(and(eq(notesTable.id, id), within(reach)))
        .limit(1);

      return row ? toNote(row) : null;
    },

    async insert(note) {
      const [row] = await scope.insert(note).returning();
      if (!row) throw new Error(`note ${note.id} was not returned after insert`);

      return toNote(row);
    },

    // 範囲の条件を WHERE に入れて 1 文で書く。確認と書き込みの間に割り込まれない
    async updateWithin(id, reach, changes) {
      const [row] = await scope
        .update(changes)
        .where(and(eq(notesTable.id, id), within(reach)))
        .returning();

      return row ? toNote(row) : null;
    },

    async deleteWithin(id, reach) {
      const rows = await scope
        .delete()
        .where(and(eq(notesTable.id, id), within(reach)))
        .returning({ id: notesTable.id });

      return rows.length > 0;
    },
  };
}
