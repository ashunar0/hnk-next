/**
 * notes の手順（How）。domain のモノを使って、何をどの順でやるか
 */
import { err, ok, type Result } from "hnk/result";
import { NotFound } from "hnk/failures";
import type { Page, PageQuery } from "hnk/page";
import type { Actor, User } from "../users/domain";
import {
  newNoteId,
  reachOf,
  type Note,
  type NoteChanges,
  type NoteId,
  type NoteInput,
  type NoteReach,
} from "./domain";

/** 一覧の 1 ページ。位置は更新の新しい順（updatedAt と id）で決まる */
export type NotePage = Page<Note>;

/**
 * 手順が必要とする保存の形。使う側のここで宣言し、repo.d1.ts がそれを満たす。
 * service は保存の実装を知らないので、テストでは同じ形の偽物を渡せる
 */
export type NotesRepository = {
  /** 範囲の中のものを、更新の新しい順に 1 ページ */
  listWithin(reach: NoteReach, query: PageQuery): Promise<NotePage>;
  /** 範囲の中に無ければ null */
  findWithin(id: NoteId, reach: NoteReach): Promise<Note | null>;
  insert(note: Note): Promise<Note>;
  /** 範囲の中のものだけを書き換える。無ければ null */
  updateWithin(id: NoteId, reach: NoteReach, changes: NoteChanges): Promise<Note | null>;
  /** 範囲の中のものだけを消す。消せたら true */
  deleteWithin(id: NoteId, reach: NoteReach): Promise<boolean>;
};

/**
 * 引数の順番は、誰として（actor）→ 何を → どうする → いつ（now）。
 * 時計は読まない。時刻が要る手順は、入口が決めた now を受け取る
 */
export function notesService(repo: NotesRepository) {
  return {
    /** 一覧。触れる範囲のものだけ、更新の新しい順 */
    async list(actor: Actor, query: PageQuery): Promise<NotePage> {
      return repo.listWithin(reachOf(actor), query);
    },

    /** 範囲の外のものは、在ることも知らせない */
    async get(actor: Actor, id: NoteId): Promise<Result<Note, typeof NotFound.code>> {
      const found = await repo.findWithin(id, reachOf(actor));
      if (found === null) return err(NotFound.code);

      return ok(found);
    },

    /** 作成。作った人が所有者になる */
    async create(actor: User, input: NoteInput, now: Date): Promise<Note> {
      return repo.insert({
        id: newNoteId(),
        orgId: actor.orgId,
        ownerId: actor.id,
        title: input.title,
        body: input.body,
        createdAt: now,
        updatedAt: now,
      });
    },

    /** 書き換えられるのは、範囲の中のものだけ */
    async update(
      actor: Actor,
      id: NoteId,
      input: NoteInput,
      now: Date,
    ): Promise<Result<Note, typeof NotFound.code>> {
      const changes = { title: input.title, body: input.body, updatedAt: now };
      const updated = await repo.updateWithin(id, reachOf(actor), changes);
      if (updated === null) return err(NotFound.code);

      return ok(updated);
    },

    /** 消せるのは、範囲の中のものだけ */
    async remove(actor: Actor, id: NoteId): Promise<Result<void, typeof NotFound.code>> {
      const deleted = await repo.deleteWithin(id, reachOf(actor));
      if (!deleted) return err(NotFound.code);

      return ok(undefined);
    },
  };
}
