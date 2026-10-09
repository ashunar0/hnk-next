/**
 * キューへの積み込み。service.ts が宣言した ReminderJobs を、Cloudflare Queues で満たす。
 * 積んだものを受け取る側は queue.ts（入口）
 */
import type { ReminderJob } from "./domain";
import type { ReminderJobs } from "./service";

export function queuesReminderJobs(queue: Queue<ReminderJob>): ReminderJobs {
  return {
    async enqueue(jobs) {
      if (jobs.length === 0) return;

      await queue.sendBatch(jobs.map((body) => ({ body })));
    },
  };
}
