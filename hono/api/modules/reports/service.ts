/**
 * レポートの手順（How）
 */
import { err, ok, type Result } from "hnk/result";
import type { Viewer } from "../users/domain";
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
 * 期間は [from, to) の時刻で渡す
 */
export type ReportsRepository = {
  invoicedByMonth(from: Date, to: Date): Promise<{ month: string; total: number }[]>;
  receivedByMonth(from: Date, to: Date): Promise<{ month: string; total: number }[]>;
};

export function reportsService(repo: ReportsRepository) {
  return {
    /** from から to まで（両端を含む）の月ごとの集計 */
    async monthly(
      viewer: Viewer,
      from: Month,
      to: Month,
    ): Promise<Result<MonthlySummary[], "FORBIDDEN">> {
      if (!canViewReports(viewer)) return err("FORBIDDEN");

      const start = startOfMonth(from);
      const end = startOfMonth(nextMonth(to));

      const [invoiced, received] = await Promise.all([
        repo.invoicedByMonth(start, end),
        repo.receivedByMonth(start, end),
      ]);

      return ok(summarize(monthsBetween(from, to), invoiced, received));
    },
  };
}

export type ReportsService = ReturnType<typeof reportsService>;
