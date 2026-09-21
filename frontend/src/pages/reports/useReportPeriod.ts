import { useSearchParams } from "react-router-dom";
import { isoDate, toLocalDate, MONTHS_SHORT } from "../../lib/format";
import { currentMonthKey, isValidMonthKey, shiftMonth, monthTitle, monthRange, parseMonthKey, weekRange, type MonthKey } from "../../lib/month";

export type Range = "week" | "month" | "year";

export const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function weekTitle(from: Date, to: Date, short = false): string {
  const f = `${from.getDate()} ${MONTHS_SHORT[from.getMonth()]}`;
  const t = `${to.getDate()} ${MONTHS_SHORT[to.getMonth()]}`;
  return short ? `${f} – ${t}` : `${f} – ${t} ${to.getFullYear()}`;
}

export interface ReportPeriod {
  range: Range;
  monthKey: MonthKey;
  year: number;
  weekKey: string;
  week: { from: Date; to: Date };
  // The calendar year the period falls in (the week's Monday decides for weeks).
  anchorYear: number;
  // Inclusive YYYY-MM-DD bounds of the period.
  dateFrom: string;
  dateTo: string;
  title: string;
  shortTitle: string;
  nextDisabled: boolean;
  setRange: (r: Range) => void;
  goPrev: () => void;
  goNext: () => void;
  // The query string carrying the period, for links into the report sub-pages.
  search: string;
}

// useReportPeriod reads the Week/Month/Year scope and its anchor from the URL
// (?range=month&month=2026-09, ?range=year&year=2026, ?range=week&week=2026-09-14)
// and gives back the period bounds plus the prev/next handlers. The Reports page
// and its drill-downs share it so the scope survives navigation between them.
export function useReportPeriod(now = new Date()): ReportPeriod {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawRange = searchParams.get("range");
  const range: Range = rawRange === "week" || rawRange === "year" ? rawRange : "month";

  const monthParam = searchParams.get("month");
  const monthKey = isValidMonthKey(monthParam) ? monthParam : currentMonthKey(now);

  const yearParam = searchParams.get("year");
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : now.getFullYear();

  const weekParam = searchParams.get("week");
  const weekKey = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : isoDate(now);

  function updateParams(patch: Record<string, string>) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) next.set(k, v);
        return next;
      },
      { replace: true },
    );
  }

  function setRange(r: Range) {
    updateParams({ range: r });
  }

  function goPrev() {
    if (range === "week") updateParams({ range, week: isoDate(addDays(toLocalDate(weekKey), -7)) });
    else if (range === "year") updateParams({ range, year: String(year - 1) });
    else updateParams({ range, month: shiftMonth(monthKey, -1) });
  }

  function goNext() {
    if (range === "week") updateParams({ range, week: isoDate(addDays(toLocalDate(weekKey), 7)) });
    else if (range === "year") updateParams({ range, year: String(year + 1) });
    else updateParams({ range, month: shiftMonth(monthKey, 1) });
  }

  const week = weekRange(toLocalDate(weekKey));
  const currentWeekFrom = weekRange(now).from;

  const nextDisabled =
    range === "month" ? monthKey >= currentMonthKey(now) : range === "year" ? year >= now.getFullYear() : week.from.getTime() >= currentWeekFrom.getTime();

  const title = range === "month" ? monthTitle(monthKey) : range === "year" ? String(year) : weekTitle(week.from, week.to);
  const shortTitle = range === "month" ? monthTitle(monthKey, true) : range === "year" ? String(year) : weekTitle(week.from, week.to, true);

  let anchorYear: number;
  let dateFrom: string;
  let dateTo: string;
  if (range === "month") {
    anchorYear = parseMonthKey(monthKey).year;
    ({ from: dateFrom, to: dateTo } = monthRange(monthKey));
  } else if (range === "year") {
    anchorYear = year;
    dateFrom = `${year}-01-01`;
    dateTo = `${year}-12-31`;
  } else {
    anchorYear = week.from.getFullYear();
    dateFrom = isoDate(week.from);
    dateTo = isoDate(week.to);
  }

  return {
    range,
    monthKey,
    year,
    weekKey,
    week,
    anchorYear,
    dateFrom,
    dateTo,
    title,
    shortTitle,
    nextDisabled,
    setRange,
    goPrev,
    goNext,
    search: searchParams.toString() ? `?${searchParams.toString()}` : "",
  };
}

// useYearParam is the year-only stepper used by the Averages and Cash flow
// pages. It reads ?year=YYYY and never steps past the current year.
export function useYearParam(now = new Date()): { year: number; setYear: (y: number) => void; nextDisabled: boolean } {
  const [searchParams, setSearchParams] = useSearchParams();
  const yearParam = searchParams.get("year");
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : now.getFullYear();
  function setYear(y: number) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("year", String(y));
        return next;
      },
      { replace: true },
    );
  }
  return { year, setYear, nextDisabled: year >= now.getFullYear() };
}

// elapsedMonths says how many months of `year` have started: 12 for a past
// year, the current month number for this year, 0 for a future year.
export function elapsedMonths(year: number, now = new Date()): number {
  if (year < now.getFullYear()) return 12;
  if (year > now.getFullYear()) return 0;
  return now.getMonth() + 1;
}
