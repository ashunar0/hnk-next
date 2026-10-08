/**
 * レポートというモノ。請求と入金を、月ごとに並べたもの（What）。
 * 自分では何も保存しない。他の module が保存したものを読んで作る
 */
import type { Viewer } from "../users/domain";

/** 月を表す文字列（YYYY-MM、UTC） */
export type Month = `${number}-${number}`;

/** 1 か月分の集計 */
export type MonthlySummary = {
  month: Month;
  /** 送付済み・支払い済みの請求書の金額（期限の月で数える） */
  invoiced: number;
  /** 成功した支払いの金額（成功した月で数える） */
  received: number;
};

/** レポートを見られるのは admin だけ */
export const canViewReports = (viewer: Viewer) => viewer.kind === "user" && viewer.role === "admin";

/** その月の初め（UTC） */
export const startOfMonth = (month: Month) => new Date(`${month}-01T00:00:00Z`);

/** 次の月 */
export const nextMonth = (month: Month): Month => {
  const d = startOfMonth(month);
  d.setUTCMonth(d.getUTCMonth() + 1);

  return d.toISOString().slice(0, 7) as Month;
};

/** from から to まで（両端を含む）の月を並べる */
export const monthsBetween = (from: Month, to: Month): Month[] => {
  const months: Month[] = [];
  for (let m = from; m <= to; m = nextMonth(m)) months.push(m);

  return months;
};

/** 月ごとの合計を並べる。データが無い月は 0 にする */
export const summarize = (
  months: Month[],
  invoiced: { month: string; total: number }[],
  received: { month: string; total: number }[],
): MonthlySummary[] => {
  const invoicedBy = new Map(invoiced.map((r) => [r.month, r.total]));
  const receivedBy = new Map(received.map((r) => [r.month, r.total]));

  return months.map((month) => ({
    month,
    invoiced: invoicedBy.get(month) ?? 0,
    received: receivedBy.get(month) ?? 0,
  }));
};
