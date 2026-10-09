/**
 * レポートの手順（How）
 */
import { err, ok, type Result } from "hnk/result";
import { Forbidden } from "hnk/failures";
import type { Actor } from "../users/domain";
import {
  canViewReports,
  monthsBetween,
  nextMonth,
  startOfMonth,
  summarize,
  type Month,
  type MonthlySummary,
} from "./domain";

/**
 * 手順が必要とする読みの形。repo.d1.ts が満たす。
 * 期間は [from, to) の時刻で渡す。誰が見るかを渡し、触れる範囲の決め方は読む側（invoices の範囲）に任せる
 */
export type ReportsRepository = {
  invoicedByMonth(actor: Actor, from: Date, to: Date): Promise<{ month: string; total: number }[]>;
  receivedByMonth(actor: Actor, from: Date, to: Date): Promise<{ month: string; total: number }[]>;
};

export function reportsService(repo: ReportsRepository) {
  return {
    /** from から to まで（両端を含む）の月ごとの集計 */
    async monthly(
      actor: Actor,
      from: Month,
      to: Month,
    ): Promise<Result<MonthlySummary[], typeof Forbidden.code>> {
      if (!canViewReports(actor)) return err(Forbidden.code);

      const start = startOfMonth(from);
      const end = startOfMonth(nextMonth(to));

      const [invoiced, received] = await Promise.all([
        repo.invoicedByMonth(actor, start, end),
        repo.receivedByMonth(actor, start, end),
      ]);

      return ok(summarize(monthsBetween(from, to), invoiced, received));
    },
  };
}

export type ReportsService = ReturnType<typeof reportsService>;
