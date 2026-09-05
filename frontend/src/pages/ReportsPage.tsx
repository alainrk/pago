import { useSearchParams } from "react-router-dom";
import { Page } from "../layout/AppShell";
import { MobileHeader } from "../layout/MobileHeader";
import { PageHeader } from "../components/PageHeader";
import { Segmented } from "../components/Segmented";
import { MonthNav } from "../components/MonthNav";
import { Card, CardTitle } from "../components/Card";
import { StatCard } from "../components/StatCard";
import { EmptyState } from "../components/EmptyState";
import { PageLoading, ErrorNote } from "../components/Spinner";
import { BarChart, type BarPoint } from "./reports/BarChart";
import { CategoryBars, type CategoryRow } from "./reports/CategoryBars";
import { useQuery } from "../lib/useQuery";
import { useSwipe } from "../lib/useSwipe";
import { useUser } from "../auth/AuthContext";
import { analytics, transactions } from "../api/endpoints";
import { categoryLabel } from "../lib/categories";
import { formatBalance, formatSigned, isoDate, toLocalDate, MONTHS_SHORT } from "../lib/format";
import { currentMonthKey, isValidMonthKey, shiftMonth, monthTitle, parseMonthKey, isCurrentMonth, weekRange } from "../lib/month";
import type { CategoryEntry, TransactionDTO } from "../api/types";
import styles from "./ReportsPage.module.css";

type Range = "week" | "month" | "year";

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface ReportData {
  income: number;
  expenses: number;
  balance: number;
  count: number;
  hasExpenses: boolean;
  categoryRows: CategoryRow[];
  bars: BarPoint[];
  barsTitle: string;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function weekTitle(from: Date, to: Date, short = false): string {
  const f = `${from.getDate()} ${MONTHS_SHORT[from.getMonth()]}`;
  const t = `${to.getDate()} ${MONTHS_SHORT[to.getMonth()]}`;
  return short ? `${f} – ${t}` : `${f} – ${t} ${to.getFullYear()}`;
}

// buildCategoryRows sorts categories by amount, keeps the top 7 and merges
// the rest (plus the OtherExpenses bucket) into a trailing "Other" row.
function buildCategoryRows(entries: { category: string; amount: number }[]): CategoryRow[] {
  let otherAmount = 0;
  const named: { category: string; amount: number }[] = [];
  for (const e of entries) {
    if (e.amount <= 0) continue;
    if (e.category === "OtherExpenses") otherAmount += e.amount;
    else named.push(e);
  }
  named.sort((a, b) => b.amount - a.amount);
  const top = named.slice(0, 7);
  for (const rest of named.slice(7)) otherAmount += rest.amount;

  const total = top.reduce((s, e) => s + e.amount, 0) + otherAmount;
  const rows: CategoryRow[] = top.map((e) => ({
    key: e.category,
    label: categoryLabel(e.category),
    amount: e.amount,
    pct: total > 0 ? Math.round((e.amount / total) * 100) : 0,
  }));
  if (otherAmount > 0) {
    rows.push({
      key: "__other__",
      label: "Other",
      amount: otherAmount,
      pct: total > 0 ? Math.round((otherAmount / total) * 100) : 0,
      muted: true,
    });
  }
  return rows;
}

function sumCounts(entries: CategoryEntry[] | null): number {
  return (entries ?? []).reduce((s, e) => s + e.count, 0);
}

function toEntries(entries: CategoryEntry[] | null): { category: string; amount: number }[] {
  return (entries ?? []).map((e) => ({ category: e.category, amount: e.amount }));
}

export function ReportsPage() {
  const { currency } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawRange = searchParams.get("range");
  const range: Range = rawRange === "week" || rawRange === "year" ? rawRange : "month";

  const monthParam = searchParams.get("month");
  const monthKey = isValidMonthKey(monthParam) ? monthParam : currentMonthKey();

  const yearParam = searchParams.get("year");
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : new Date().getFullYear();

  const weekParam = searchParams.get("week");
  const weekKey = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : isoDate(new Date());

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

  const now = new Date();
  const currentYear = now.getFullYear();
  const weekAnchor = toLocalDate(weekKey);
  const week = weekRange(weekAnchor);
  const currentWeekFrom = weekRange(now).from;

  const navNextDisabled =
    range === "month" ? monthKey >= currentMonthKey() : range === "year" ? year >= currentYear : week.from.getTime() >= currentWeekFrom.getTime();

  // Phones: swipe left for the next period, right for the previous one.
  const swipe = useSwipe(
    () => {
      if (!navNextDisabled) goNext();
    },
    () => goPrev(),
  );

  const desktopTitle = range === "month" ? monthTitle(monthKey) : range === "year" ? String(year) : weekTitle(week.from, week.to);
  const mobileTitle = range === "month" ? monthTitle(monthKey, true) : range === "year" ? String(year) : weekTitle(week.from, week.to, true);

  async function loadReport(signal: AbortSignal): Promise<ReportData> {
    if (range === "month") {
      const [monthly, trend] = await Promise.all([analytics.monthly(monthKey, signal), analytics.trend(6, signal)]);
      const inWindow = trend.points.some((p) => p.month === monthKey);
      const bars: BarPoint[] = trend.points.map((p, i) => ({
        label: MONTHS_SHORT[parseMonthKey(p.month).month - 1],
        value: p.expense,
        highlight: inWindow ? p.month === monthKey : i === trend.points.length - 1 && isCurrentMonth(p.month),
      }));
      return {
        income: monthly.totalIncome,
        expenses: monthly.totalExpenses,
        balance: monthly.balance,
        count: sumCounts(monthly.byCategory.Expense) + sumCounts(monthly.byCategory.Income),
        hasExpenses: monthly.totalExpenses > 0,
        categoryRows: buildCategoryRows(toEntries(monthly.byCategory.Expense)),
        bars,
        barsTitle: "Expenses, last 6 months",
      };
    }

    if (range === "year") {
      const res = await analytics.year(year, signal);
      const byMonth = [...res.byMonth].sort((a, b) => a.month - b.month);
      const bars: BarPoint[] = byMonth.map((m) => ({
        label: MONTHS_SHORT[m.month - 1],
        value: m.expense,
        highlight: year === currentYear && m.month === now.getMonth() + 1,
      }));
      return {
        income: res.totalIncome,
        expenses: res.totalExpenses,
        balance: res.balance,
        count: sumCounts(res.byCategory.Expense) + sumCounts(res.byCategory.Income),
        hasExpenses: res.totalExpenses > 0,
        categoryRows: buildCategoryRows(toEntries(res.byCategory.Expense)),
        bars,
        barsTitle: "Expenses by month",
      };
    }

    // week
    const dateFrom = isoDate(week.from);
    const dateTo = isoDate(week.to);
    let all: TransactionDTO[] = [];
    let total = 0;
    let offset = 0;
    const limit = 200;
    for (let page = 0; page < 5; page++) {
      const res = await transactions.search({ dateFrom, dateTo, offset, limit }, signal);
      all = all.concat(res.transactions);
      total = res.total;
      offset += limit;
      if (offset >= total || res.transactions.length === 0) break;
    }

    let income = 0;
    let expenses = 0;
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    const catMap = new Map<string, number>();
    for (const t of all) {
      if (t.type === "Income") {
        income += t.amount;
        continue;
      }
      expenses += t.amount;
      const d = toLocalDate(t.date);
      const dow = (d.getDay() + 6) % 7;
      dayTotals[dow] += t.amount;
      catMap.set(t.category, (catMap.get(t.category) ?? 0) + t.amount);
    }

    const isCurrentWeek = isoDate(week.from) === isoDate(currentWeekFrom);
    const todayDow = (now.getDay() + 6) % 7;
    const bars: BarPoint[] = WEEKDAY_LABELS.map((label, i) => ({
      label,
      value: dayTotals[i],
      highlight: isCurrentWeek && i === todayDow,
    }));

    return {
      income,
      expenses,
      balance: income - expenses,
      count: total,
      hasExpenses: expenses > 0,
      categoryRows: buildCategoryRows(Array.from(catMap, ([category, amount]) => ({ category, amount }))),
      bars,
      barsTitle: "Expenses by day",
    };
  }

  const { data, error, loading, reload } = useQuery(loadReport, [range, monthKey, year, weekKey]);

  const rangeControl = <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} size="md" ariaLabel="Report range" />;

  return (
    <>
      <MobileHeader
        title="Reports"
        right={<MonthNav variant="sm" title={mobileTitle} onPrev={goPrev} onNext={goNext} nextDisabled={navNextDisabled} />}
        tools={<Segmented full options={RANGE_OPTIONS} value={range} onChange={setRange} size="md" ariaLabel="Report range" />}
      />
      <Page {...swipe}>
        <PageHeader
          title="Reports"
          left={rangeControl}
          right={<MonthNav variant="md" title={desktopTitle} onPrev={goPrev} onNext={goNext} nextDisabled={navNextDisabled} />}
        />
        {error ? (
          <ErrorNote message={error} onRetry={reload} />
        ) : loading && !data ? (
          <PageLoading />
        ) : data ? (
          <>
            <div className={styles.stats}>
              <StatCard label="Income" value={formatBalance(data.income, currency)} tone="income" />
              <StatCard label="Expenses" value={formatSigned(data.expenses, "Expense", currency)} tone="plain" />
              <BalanceStat balance={data.balance} currency={currency} />
              <StatCard label="Transactions" value={String(data.count)} tone="plain" />
            </div>
            <div className={styles.grid}>
              <Card radius="lg" padding="24px 28px" paddingMobile="20px" gap="18px" gapMobile="14px">
                <CardTitle>Spending by category</CardTitle>
                {data.hasExpenses ? <CategoryBars rows={data.categoryRows} currency={currency} /> : <EmptyState icon="trend" title="No expenses in this period" />}
              </Card>
              <BarChart title={data.barsTitle} bars={data.bars} currency={currency} />
            </div>
          </>
        ) : null}
      </Page>
    </>
  );
}

// BalanceStat mirrors StatCard but colours the value by money direction:
// green when the period ended ahead, red when it ran at a loss.
function BalanceStat({ balance, currency }: { balance: number; currency: string }) {
  const color = balance >= 0 ? "var(--income)" : "var(--danger)";
  return (
    <Card padding="20px 24px" paddingMobile="16px" gap="6px" gapMobile="4px">
      <div className="stat-label">Balance</div>
      <div className="mono stat-value" style={{ fontWeight: 600, color }}>
        {formatBalance(balance, currency)}
      </div>
    </Card>
  );
}
