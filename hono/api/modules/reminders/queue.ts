/**
 * キューから受け取る入口。routes.ts と並ぶ入口の 1 つで、利用者はいない。
 * 積まれた督促を 1 件ずつ送る。失敗したものだけを再送に回す
 */
import type { Deps } from "../../deps";
import { systemViewer } from "../users/domain";
import type { ReminderJob } from "./domain";

export async function sendReminders({ reminders }: Deps, batch: MessageBatch<ReminderJob>) {
  for (const message of batch.messages) {
    const result = await reminders.send(message.body, systemViewer, new Date());

    if (result.ok) message.ack();
    else message.retry();
  }
}
