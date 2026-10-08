/**
 * 督促の手順（How）。期限切れを探して積む手順と、1 件ずつ送る手順の 2 つ
 */
import { err, ok, type Result } from "hnk/result";
import type { Viewer } from "../users/domain";
import {
  dayOf,
  reminderKey,
  reminderMail,
  type Reminder,
  type ReminderJob,
  type ReminderStatus,
} from "./domain";

/** 手順が必要とする保存の形。repo.d1.ts が満たす */
export type RemindersRepository = {
  /** 送る前に押さえる。もう押さえてあれば何もしない。今の状態を返す */
  claim(reminder: Reminder): Promise<ReminderStatus>;
  /** 送れたことを確定する */
  markSent(reminder: Reminder): Promise<void>;
  /** 送るべきでなかった（積んだ後に支払われた、消された）ことを残す */
  markSkipped(reminder: Reminder): Promise<void>;
};

/** 手順が必要とするメールの形。mailer.resend.ts が満たす */
export type Mailer = {
  /** 同じ idempotencyKey の送信は、提供元が 1 通にまとめる（24 時間） */
  send(mail: {
    to: string;
    subject: string;
    body: string;
    idempotencyKey: string;
  }): Promise<Result<void, "MAIL_FAILED">>;
};

/** 手順が必要とする積み先の形。jobs.queues.ts が満たす */
export type ReminderJobs = {
  enqueue(jobs: ReminderJob[]): Promise<void>;
};

/** 手順が必要とする請求書の形。invoices の service が満たし、deps.ts でつなぐ */
export type OverdueInvoices = {
  listOverdue(viewer: Viewer, now: Date): Promise<{ id: string }[]>;
  /** 督促してよいかを invoices に問う。判定は invoices のルールに任せる */
  getRemindable(
    id: string,
    viewer: Viewer,
    now: Date,
  ): Promise<
    Result<
      { title: string; amount: number; customerEmail: string; dueAt: Date },
      "NOT_FOUND" | "NOT_REMINDABLE"
    >
  >;
};

export function remindersService(
  repo: RemindersRepository,
  mailer: Mailer,
  jobs: ReminderJobs,
  invoices: OverdueInvoices,
) {
  return {
    /** 期限切れの請求書を探し、督促を 1 件ずつキューに積む。範囲は viewer で決まる */
    async enqueueOverdue(viewer: Viewer, now: Date): Promise<number> {
      const overdue = await invoices.listOverdue(viewer, now);

      await jobs.enqueue(overdue.map((invoice) => ({ invoiceId: invoice.id })));

      return overdue.length;
    },

    /**
     * 督促を 1 通送る。同じ請求書には 1 日 1 通まで。
     *
     * 先に押さえ → メールを送る → 確定、の順。キューは同じ中身を 2 回届けることがあり、途中で落ちれば再送される。
     * - 確定済みか見送り済みなら送らない
     * - 押さえたまま落ちたら、再送で送り直す。冪等キーが同じなので、提供元が 1 通にまとめる
     * - 送るべきでなくなっていたら、見送りとして残す
     * 業務の判断: 督促は欠けても重複してもいけない。冪等キーで両方を防ぐ。
     * ただし提供元が冪等キーを覚えているのは 24 時間（Resend）。それより後の再送では 2 通目が出うる。
     * キーに日付が入っていて、キューの再送も同じ日のうちに終わる前提で成り立つ
     */
    async send(
      job: ReminderJob,
      viewer: Viewer,
      now: Date,
    ): Promise<Result<"SENT" | "SKIPPED", "MAIL_FAILED">> {
      const reminder = { invoiceId: job.invoiceId, sentOn: dayOf(now) };
      if ((await repo.claim(reminder)) !== "claimed") return ok("SKIPPED");

      // 積んだ後に支払われたり消されたりしたものは送らない
      const invoice = await invoices.getRemindable(job.invoiceId, viewer, now);
      if (!invoice.ok) {
        await repo.markSkipped(reminder);
        return ok("SKIPPED");
      }

      const sent = await mailer.send({
        to: invoice.value.customerEmail,
        ...reminderMail(invoice.value),
        idempotencyKey: reminderKey(reminder),
      });
      if (!sent.ok) return err(sent.error);

      await repo.markSent(reminder);

      return ok("SENT");
    },
  };
}

export type RemindersService = ReturnType<typeof remindersService>;
