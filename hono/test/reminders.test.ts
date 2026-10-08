import { expect, it } from "vitest";
import { err, ok } from "hnk/result";
import { scopeTo } from "../api/db";
import { remindersRepository, remindersTable } from "../api/modules/reminders/repo.d1";
import {
  remindersService,
  type Mailer,
  type OverdueInvoices,
} from "../api/modules/reminders/service";
import { systemViewer } from "../api/modules/users/domain";
import { db, insertInvoices, invoice } from "./fixtures";

const now = new Date("2026-06-10T00:00:00Z");

/** 送ったメールを覚えておく偽物。fail を true にすると 1 回だけ失敗する */
const fakeMailer = () => {
  const sent: string[] = [];
  let fail = false;
  const mailer: Mailer = {
    async send({ idempotencyKey }) {
      if (fail) {
        fail = false;
        return err("MAIL_FAILED");
      }
      sent.push(idempotencyKey);
      return ok(undefined);
    },
  };
  return { mailer, sent, failOnce: () => (fail = true) };
};

const remindable: OverdueInvoices = {
  async listOverdue() {
    return [];
  },
  async getRemindable() {
    return ok({
      title: "t",
      amount: 1000,
      customerEmail: "c@example.com",
      dueAt: new Date("2026-06-01T00:00:00Z"),
    });
  },
};

it("同じ日に 2 回届いても、送るのは 1 回。2 回目は確定済みなので送らない", async () => {
  await insertInvoices([invoice({ id: "r1" })]);
  const { mailer, sent } = fakeMailer();
  const reminders = remindersService(
    remindersRepository(scopeTo(db(), remindersTable)),
    mailer,
    { async enqueue() {} },
    remindable,
  );

  expect(await reminders.send({ invoiceId: "r1" }, systemViewer, now)).toEqual({
    ok: true,
    value: "SENT",
  });
  expect(await reminders.send({ invoiceId: "r1" }, systemViewer, now)).toEqual({
    ok: true,
    value: "SKIPPED",
  });
  expect(sent).toEqual(["reminder/r1/2026-06-10"]);
});

it("メールに失敗したら押さえたまま残り、再送で同じ冪等キーで送り直す", async () => {
  await insertInvoices([invoice({ id: "r2" })]);
  const { mailer, sent, failOnce } = fakeMailer();
  const reminders = remindersService(
    remindersRepository(scopeTo(db(), remindersTable)),
    mailer,
    { async enqueue() {} },
    remindable,
  );

  failOnce();
  expect(await reminders.send({ invoiceId: "r2" }, systemViewer, now)).toEqual({
    ok: false,
    error: "MAIL_FAILED",
  });
  expect(await reminders.send({ invoiceId: "r2" }, systemViewer, now)).toEqual({
    ok: true,
    value: "SENT",
  });
  expect(sent).toEqual(["reminder/r2/2026-06-10"]);
});
