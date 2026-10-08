/**
 * キューから受け取る入口。routes.ts と並ぶ入口の 1 つで、利用者はいない。
 * 積まれた督促を 1 件ずつ送る。ack と retry は createWorker が Result で決める
 * （送れた・見送りは ok で ack、送れなかったら err で retry）。
 * now はメッセージが積まれた時刻。再送が日をまたいでも、同じ日の督促として扱える
 */
import type { QueueContext } from "hnk";
import type { ReminderJob } from "./domain";

export function sendReminder({ deps, system, now, body }: QueueContext<ReminderJob>) {
  return deps.reminders.send(body, system, now);
}
