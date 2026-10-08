/**
 * 督促というモノ。期限を過ぎた請求書について、請求先に送る知らせ（What）
 */

/** 1 通の督促。同じ請求書には 1 日 1 通まで */
export type Reminder = {
  invoiceId: string;
  /** 送る日（YYYY-MM-DD、UTC） */
  sentOn: string;
};

/** 督促の状態。送る前に押さえ（claimed）、送れたら確定（sent） */
export const reminderStatuses = ["claimed", "sent"] as const;

export type ReminderStatus = (typeof reminderStatuses)[number];

/** メールの提供元に渡す冪等キー。同じ請求書・同じ日なら同じキーになる */
export const reminderKey = (reminder: Reminder) =>
  `reminder/${reminder.invoiceId}/${reminder.sentOn}`;

/** 督促を積むときに、キューに載せる中身 */
export type ReminderJob = {
  invoiceId: string;
};

/** その日を表す文字列。1 日 1 通の判定に使う */
export const dayOf = (now: Date) => now.toISOString().slice(0, 10);

/** 督促の文面 */
export const reminderMail = (invoice: { title: string; amount: number; dueAt: Date }) => ({
  subject: `【お支払いのお願い】${invoice.title}`,
  body: [
    `「${invoice.title}」のお支払い期限（${dayOf(invoice.dueAt)}）を過ぎています。`,
    `ご請求額: ${invoice.amount.toLocaleString("ja-JP")} 円`,
    "お手数ですが、お支払いをお願いいたします。",
  ].join("\n"),
});
