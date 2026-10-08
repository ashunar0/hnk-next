/**
 * 督促の手順（How）。期限切れを探して積む手順と、1 件ずつ送る手順の 2 つ
 */
import { err, ok, type Result } from "hnk/result";
import type { Viewer } from "../users/domain";
import { dayOf, reminderMail, type Reminder, type ReminderJob } from "./domain";

/** 手順が必要とする保存の形。repo.d1.ts が満たす */
export type RemindersRepository = {
  /** その日に送った記録があるか */
  exists(reminder: Reminder): Promise<boolean>;
  /** 送った記録を残す。もうあれば何もしない */
  record(reminder: Reminder): Promise<void>;
};

/** 手順が必要とするメールの形。mailer.resend.ts が満たす */
export type Mailer = {
  send(mail: { to: string; subject: string; body: string }): Promise<Result<void, "MAIL_FAILED">>;
};

/** 手順が必要とする積み先の形。jobs.queues.ts が満たす */
export type ReminderJobs = {
  enqueue(jobs: ReminderJob[]): Promise<void>;
};

/** 手順が必要とする請求書の形。invoices の service が満たし、deps.ts でつなぐ */
export type OverdueInvoices = {
  listOverdue(viewer: Viewer, now: Date): Promise<{ id: string }[]>;
  get(
    id: string,
    viewer: Viewer,
  ): Promise<
    Result<
      {
        id: string;
        title: string;
        amount: number;
        customerEmail: string;
        dueAt: Date;
        status: string;
      },
      "NOT_FOUND"
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
     * キューは同じ中身を 2 回届けることがあるので、何度呼んでも 1 通にする
     */
    async send(
      job: ReminderJob,
      viewer: Viewer,
      now: Date,
    ): Promise<Result<"SENT" | "SKIPPED", "MAIL_FAILED">> {
      const reminder = { invoiceId: job.invoiceId, sentOn: dayOf(now) };
      if (await repo.exists(reminder)) return ok("SKIPPED");

      // 積んだ後に支払われたり消されたりしたものは送らない
      const invoice = await invoices.get(job.invoiceId, viewer);
      if (!invoice.ok || invoice.value.status !== "sent") return ok("SKIPPED");

      const sent = await mailer.send({
        to: invoice.value.customerEmail,
        ...reminderMail(invoice.value),
      });
      if (!sent.ok) return err(sent.error);

      // 送った後に記録する。記録に失敗すると、再送で同じ日に 2 通目が出ることがある
      await repo.record(reminder);

      return ok("SENT");
    },
  };
}

export type RemindersService = ReturnType<typeof remindersService>;
