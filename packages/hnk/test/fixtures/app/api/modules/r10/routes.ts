// expect: hnk(route-lists-are-paged) | 一覧の route に件数の上限が無い
import { createRouter } from "hnk";
import { requireAuth } from "../../middleware/auth";

declare const pageQuery: object;
const pagedQuery = { ...pageQuery };

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
