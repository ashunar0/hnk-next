/**
 * 利用者というモノ。今は、ログインしている人が誰で、どのロールかだけ。
 * 他の module の domain は、ここから型だけを借りる。systemViewer の値は inbound だけが使う
 */

/** ロール。admin は全員のものに触れ、member は自分のものだけ */
export const roles = ["member", "admin"] as const;

export type Role = (typeof roles)[number];

/**
 * 印。このファイルの外からは名前が見えないので、`{ kind: "system" }` のようなリテラルでは
 * 印の付いた値を書けない。作れるのは下の systemViewer と authenticatedUser だけ
 */
declare const verified: unique symbol;

/** ログインしている利用者。認証を通ったときだけ作られる */
export type User = {
  readonly kind: "user";
  readonly id: string;
  readonly role: Role;
  readonly [verified]: true;
};

/**
 * システム。利用者のいない inbound（cron、キュー、webhook）が、自分で systemViewer を渡すときだけ現れる。
 * ロールではないので、ロールを文字列で扱う場所に紛れ込まない
 */
export type System = { readonly kind: "system"; readonly [verified]: true };

export const systemViewer = { kind: "system" } as System;

/** 認証を通った利用者を作る。認証の middleware（とテスト）だけが呼ぶ */
export const authenticatedUser = (id: string, role: Role) => ({ kind: "user", id, role }) as User;

/** いま操作しているのは誰か */
export type Viewer = User | System;
