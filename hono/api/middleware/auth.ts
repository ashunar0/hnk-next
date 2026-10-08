import { createMiddleware } from "hono/factory";
import type { MiddlewareHandler } from "hono";
import type { AppEnv, AuthVariables } from "../env";
import type { User } from "../modules/users/domain";
import { fail, guard } from "hnk";
import { Unauthorized } from "../errors";

/**
 * 閲覧者を文脈に積む。未ログインでも通す。
 *
 * TODO: modules/auth/ が cookie のセッションを解いて返すようになったら、
 * その結果を積む。認証提供元がまだ無いあいだは常に null
 */
export const withViewer: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("viewer", null);
  await next();
};

/**
 * ログインを要求する。createEndpoint の middleware に置くと、その先の handler で
 * authViewer が User になる（viewer は null を含んだまま）。
 * Unauthorized は responses に自動で足される
 */
export const requireAuth = guard(
  [Unauthorized],
  createMiddleware<{
    Variables: AuthVariables & { authViewer: User };
  }>(async (c, next) => {
    const viewer = c.get("viewer");
    if (viewer === null) throw fail(Unauthorized);

    c.set("authViewer", viewer);
    await next();
  }),
);

/**
 * 認証を要求しないことを明示する。何もしない。
 *
 * 置く意味は、opener の認証の引数を必ず 1 つにすること。書き忘れと「公開したい」が
 * 「書いていない」という同じ姿で現れるのを分ける。grep すればこのアプリの
 * 無認証エンドポイントが列挙できる
 */
export const allowAnonymous: MiddlewareHandler<AppEnv> = (_c, next) => next();
