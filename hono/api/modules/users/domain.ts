/**
 * 利用者というモノ。今は、ログインしている人が誰で、どの組織の、どのロールかだけ。
 * 他の module の domain は、ここから型だけを借りる。
 * システム（利用者のいない呼び出し元）は hnk が持つ。cron・キュー・webhook が受け取る
 */
import type { System } from "hnk/system";

/** ロール。admin は自分の組織の全員のものに触れ、member は自分のものだけ */
export const roles = ["member", "admin"] as const;

export type Role = (typeof roles)[number];

/**
 * 印。このファイルの外からは名前が見えないので、`{ kind: "system" }` のようなリテラルでは
 * 印の付いた値を書けない。作れるのは下の authenticatedUser だけ
 */
declare const verified: unique symbol;

/** ログインしている利用者。認証を通ったときだけ作られる */
export type User = {
  readonly kind: "user";
  readonly id: string;
  /** 所属する組織。1 人は 1 つの組織に属する */
  readonly orgId: string;
  readonly role: Role;
  readonly [verified]: true;
};

/** 認証を通った利用者を作る。認証の middleware（とテスト）だけが呼ぶ */
export const authenticatedUser = (id: string, orgId: string, role: Role) =>
  ({ kind: "user", id, orgId, role }) as User;

/** いま操作しているのは誰か */
export type Viewer = User | System;
