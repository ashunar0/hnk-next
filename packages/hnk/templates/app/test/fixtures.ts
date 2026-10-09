import { env } from "cloudflare:workers";
import { wireDb } from "../api/db";
import { buildApp } from "../api/index";
import { makeDeps } from "../api/deps";
import { authenticatedUser, orgId, userId, type User } from "../api/modules/users/domain";

export const db = () => wireDb(env.DB);

export const alice = authenticatedUser(userId("alice"), orgId("org1"), "member");
export const bob = authenticatedUser(userId("bob"), orgId("org1"), "member");
export const admin = authenticatedUser(userId("admin"), orgId("org1"), "admin");
/** 別の組織の人 */
export const carol = authenticatedUser(userId("carol"), orgId("org2"), "member");

/**
 * この利用者としてログインした状態のアプリ（本物の deps と D1）。
 * null ならログインしていない。認証の提供元の代わりにセッションの user を積むだけで、あとは本番と同じ
 */
export const appAs = (user: User | null) =>
  buildApp(makeDeps, async (c, next) => {
    c.set("user", user);
    await next();
  });

/** appAs で JSON を送る。env は本物の D1 を指す */
export const request = (user: User | null, method: string, path: string, body?: unknown) =>
  appAs(user).request(
    path,
    {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
