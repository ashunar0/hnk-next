/**
 * 利用者というモノ。今は、ログインしている人が誰で、どのロールかだけ。
 * 他の module の domain は、ここから型だけを借りる。systemViewer の値は inbound だけが使う
 */

/** ロール。admin は全員のものに触れ、member は自分のものだけ */
export const roles = ["member", "admin"] as const;

export type Role = (typeof roles)[number];

/** ログインしている利用者。認証から作られる */
export type User = { kind: "user"; id: string; role: Role };

/**
 * システム。利用者のいない inbound（cron、キュー、webhook）が、自分で systemViewer を渡すときだけ現れる。
 * ロールではないので、ロールを文字列で扱う場所に紛れ込まない
 */
export type System = { kind: "system" };

export const systemViewer: System = { kind: "system" };

/** いま操作しているのは誰か */
export type Viewer = User | System;
