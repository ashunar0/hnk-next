/**
 * 時刻で動く入口。routes.ts と並ぶ入口の 1 つで、利用者はいない。
 * 毎朝、期限切れの請求書の督促をキューに積む。
 * 誰として呼ぶか（system）と、いつの出来事か（now）は、Workers の入口（createWorker）が渡す
 */
import type { CronContext } from "hnk";

export async function enqueueOverdueReminders({ deps, system, now }: CronContext) {
  const count = await deps.reminders.enqueueOverdue(system, now);

  console.log(`reminders: ${count} 件を積んだ`);
}
