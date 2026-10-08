/**
 * 利用者というモノ。今は、ログインしている人が誰で、どのロールかだけ。
 * 他の module の domain は、ここから型だけを借りる
 */

/** ロール。admin は全員のものに触れ、member は自分のものだけ */
export const roles = ["member", "admin"] as const;

export type Role = (typeof roles)[number];

/**
 * いま操作している人。利用者のいない入口（cron、キュー）では、システムが操作する。
 * システムは認証から作られることはなく、入口のコードが systemViewer を渡すときだけ現れる
 */
export type Viewer = { id: string; role: Role } | typeof systemViewer;

export const systemViewer = { id: "system", role: "system" } as const;
