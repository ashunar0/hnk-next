/**
 * 時刻で動く入口。routes.ts と並ぶ入口の 1 つで、利用者はいない。
 * 毎朝、期限切れの請求書の督促をキューに積む。
 * 誰として呼ぶかは入口が決める。routes は認証した利用者、ここはシステム
 */
import type { Deps } from "../../deps";
import { systemViewer } from "../users/domain";

export async function enqueueOverdueReminders({ reminders }: Deps, scheduledAt: Date) {
  const count = await reminders.enqueueOverdue(systemViewer, scheduledAt);

  console.log(`reminders: ${count} 件を積んだ`);
}
