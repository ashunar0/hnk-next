// expect: hnk(route-lists-are-paged) | 一覧の route に件数の上限が無い
// expect: hnk(route-lists-are-paged) | 一覧の route に件数の上限が無い
// expect: hnk(route-lists-are-paged) | 一覧の route に件数の上限が無い
import { createRouter } from "hnk";
import { requireAuth } from "../../middleware/auth";
import { importedQuery } from "./domain";

declare const pageQuerySchema: (filters?: unknown) => object;
declare const z: { object: (shape: object) => object };
const pagedQuery = pageQuerySchema(z.object({}));
// 名前が似ているだけで、包んでいない
const notPageQuerySchema = z.object({ limit: 1 });

export const r10Router = createRouter()
  // 上限のある一覧は通る
  .endpoint(
    {
      method: "get",
      path: "/paged",
      middleware: [requireAuth],
      request: { query: pagedQuery },
      responses: {},
    },
    async () => {
      throw new Error("fixture");
    },
  )
  // その場で包んでも通る
  .endpoint(
    {
      method: "get",
      path: "/inline",
      middleware: [requireAuth],
      request: { query: pageQuerySchema() },
      responses: {},
    },
    async () => {
      throw new Error("fixture");
    },
  )
  // 名前やコメントに pageQuerySchema とあっても、包んでいなければ止まる
  .endpoint(
    {
      method: "get",
      path: "/lookalike",
      middleware: [requireAuth],
      request: { query: notPageQuerySchema },
      responses: {},
    },
    async () => {
      throw new Error("fixture");
    },
  )
  // 別のファイルから来たスキーマは辿れないので止まる（query のスキーマは同じファイルに置く）
  .endpoint(
    {
      method: "get",
      path: "/imported",
      middleware: [requireAuth],
      request: { query: importedQuery },
      responses: {},
    },
    async () => {
      throw new Error("fixture");
    },
  )
  // 1 件を取る route は一覧ではない
  .endpoint(
    {
      method: "get",
      path: "/:id",
      middleware: [requireAuth],
      responses: {},
    },
    async () => {
      throw new Error("fixture");
    },
  )
  // 例外は理由を書いて外す
  .endpoint(
    {
      method: "get",
      // oxlint-disable-next-line hnk/route-lists-are-paged -- 件数は月の数で決まる
      path: "/monthly",
      middleware: [requireAuth],
      responses: {},
    },
    async () => {
      throw new Error("fixture");
    },
  )
  // 上限が無い一覧は止まる
  .endpoint(
    {
      method: "get",
      path: "/unbounded",
      middleware: [requireAuth],
      responses: {},
    },
    async () => {
      throw new Error("fixture");
    },
  );
