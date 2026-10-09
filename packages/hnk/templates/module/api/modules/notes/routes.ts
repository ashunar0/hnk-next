/**
 * notes を HTTP で公開する。入出力の形と、モノ → 応答の変換もここに置く
 */
import {
  createRouter,
  errorResponses,
  NotFound,
  pageQuerySchema,
  pageResponse,
  pageResponseSchema,
} from "hnk";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { noteIdSchema, noteInputSchema, type Note } from "./domain";

// 受け取る形。本文の入力は domain の noteInputSchema
const noteParamsSchema = z.object({
  id: noteIdSchema,
});

const listNotesQuerySchema = pageQuerySchema();

// 返す形
const noteResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const listNotesResponseSchema = pageResponseSchema(noteResponseSchema);

const deleteNoteResponseSchema = z.object({
  ok: z.literal(true),
});

type NoteResponse = z.infer<typeof noteResponseSchema>;

// モノ → 応答。モノをそのまま返さず、見せる形に詰め替える
function noteResponse(note: Note): NoteResponse {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    createdAt: note.createdAt.getTime(),
    updatedAt: note.updatedAt.getTime(),
  };
}

export const notesRouter = createRouter()
  // 一覧
  .endpoint(
    {
      method: "get",
      path: "/",
      middleware: [requireAuth],
      request: { query: listNotesQuerySchema },
      responses: {
        200: listNotesResponseSchema,
      },
    },
    async (c, reply, { notes }) => {
      const actor = c.get("actor");
      const { cursor, limit } = c.req.valid("query");

      const page = await notes.list(actor, { after: cursor, limit });

      return reply(200, pageResponse(page, noteResponse));
    },
  )
  // 1件
  .endpoint(
    {
      method: "get",
      path: "/:id",
      middleware: [requireAuth],
      request: { param: noteParamsSchema },
      responses: {
        200: noteResponseSchema,
        ...errorResponses(NotFound),
      },
    },
    async (c, reply, { notes }) => {
      const actor = c.get("actor");
      const { id } = c.req.valid("param");

      const result = await notes.get(actor, id);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, noteResponse(result.value));
    },
  )
  // 作成
  .endpoint(
    {
      method: "post",
      path: "/",
      middleware: [requireAuth],
      request: { json: noteInputSchema },
      responses: {
        200: noteResponseSchema,
      },
    },
    async (c, reply, { notes }) => {
      const actor = c.get("actor");
      const input = c.req.valid("json");
      const now = new Date();

      const created = await notes.create(actor, input, now);

      return reply(200, noteResponse(created));
    },
  )
  // 更新
  .endpoint(
    {
      method: "put",
      path: "/:id",
      middleware: [requireAuth],
      request: { param: noteParamsSchema, json: noteInputSchema },
      responses: {
        200: noteResponseSchema,
        ...errorResponses(NotFound),
      },
    },
    async (c, reply, { notes }) => {
      const actor = c.get("actor");
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const now = new Date();

      const result = await notes.update(actor, id, input, now);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, noteResponse(result.value));
    },
  )
  // 削除
  .endpoint(
    {
      method: "delete",
      path: "/:id",
      middleware: [requireAuth],
      request: { param: noteParamsSchema },
      responses: {
        200: deleteNoteResponseSchema,
        ...errorResponses(NotFound),
      },
    },
    async (c, reply, { notes }) => {
      const actor = c.get("actor");
      const { id } = c.req.valid("param");

      const result = await notes.remove(actor, id);
      if (!result.ok) return reply.failure(result.error);

      return reply(200, { ok: true });
    },
  );
