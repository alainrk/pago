import { useNavigate } from "react-router-dom";
import { Page } from "../layout/AppShell";
import { MobileHeader } from "../layout/MobileHeader";
import { PageHeader } from "../components/PageHeader";
import { PrivacyToggle } from "../components/PrivacyToggle";
import { Segmented } from "../components/Segmented";
import { MonthNav } from "../components/MonthNav";
import { Card, CardTitle } from "../components/Card";
import { StatCard } from "../components/StatCard";
import { EmptyState } from "../components/EmptyState";
import { PageLoading, ErrorNote } from "../components/Spinner";
import { BarChart, type BarPoint } from "./reports/BarChart";
import { CategoryBars, type CategoryRow } from "./reports/CategoryBars";
import { PreviewTiles } from "./reports/PreviewTiles";
import { RANGE_OPTIONS, useReportPeriod } from "./reports/useReportPeriod";
import { useQuery } from "../lib/useQuery";
import { useSwipe } from "../lib/useSwipe";
import { useUser } from "../auth/AuthContext";
import { usePrivacy } from "../lib/privacy";
import { analytics } from "../api/endpoints";
import { searchAll } from "../api/searchAll";
import { categoryLabel } from "../lib/categories";
import { formatBalance, formatSigned, toLocalDate, MONTHS_SHORT } from "../lib/format";
import { parseMonthKey, isCurrentMonth, weekRange } from "../lib/month";
import type { CategoryEntry, YearAnalyticsResponse } from "../api/types";
import styles from "./ReportsPage.module.css";

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
  // Year data behind the Averages / Cash flow preview tiles.
  yearData: YearAnalyticsResponse;
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
  const { hidden } = usePrivacy();
  const navigate = useNavigate();
  const period = useReportPeriod();
  const { range, monthKey, year, weekKey, week, anchorYear, nextDisabled: navNextDisabled, setRange, goPrev, goNext } = period;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentWeekFrom = weekRange(now).from;

  // Phones: swipe left for the next period, right for the previous one.
  const swipe = useSwipe(
    () => {
      if (!navNextDisabled) goNext();
    },
    () => goPrev(),
  );

  const desktopTitle = period.title;
  const mobileTitle = period.shortTitle;

  function openCategory(key: string) {
    navigate(`/reports/category/${encodeURIComponent(key)}${period.search}`);
  }

  async function loadReport(signal: AbortSignal): Promise<ReportData> {
    // The preview tiles always summarise the year the period falls in.
    const yearReq = analytics.year(anchorYear, signal);

    if (range === "month") {
      const [monthly, trend, yearData] = await Promise.all([analytics.monthly(monthKey, signal), analytics.trend(6, signal), yearReq]);
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
        yearData,
      };
    }

    if (range === "year") {
      const res = await yearReq;
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
        yearData: res,
      };
    }

    // week
    const [{ all, total }, yearData] = await Promise.all([searchAll({ dateFrom: period.dateFrom, dateTo: period.dateTo }, signal), yearReq]);

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

    const isCurrentWeek = week.from.getTime() === currentWeekFrom.getTime();
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
      yearData,
    };
  }

  const { data, error, loading, reload } = useQuery(loadReport, [range, monthKey, year, weekKey]);

  const rangeControl = <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} size="md" ariaLabel="Report range" />;

  return (
    <>
      <MobileHeader
        title="Reports"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <PrivacyToggle size={30} iconSize={14} />
            <MonthNav variant="sm" title={mobileTitle} onPrev={goPrev} onNext={goNext} nextDisabled={navNextDisabled} />
          </div>
        }
        tools={<Segmented full options={RANGE_OPTIONS} value={range} onChange={setRange} size="md" ariaLabel="Report range" />}
      />
      <Page {...swipe}>
        <PageHeader
          title="Reports"
          left={rangeControl}
          right={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <PrivacyToggle />
              <MonthNav variant="md" title={desktopTitle} onPrev={goPrev} onNext={goNext} nextDisabled={navNextDisabled} />
            </div>
          }
        />
        {error ? (
          <ErrorNote message={error} onRetry={reload} />
        ) : loading && !data ? (
          <PageLoading />
        ) : data ? (
          <>
            <div className={styles.stats}>
              <StatCard label="Income" value={formatBalance(data.income, currency, hidden)} tone="income" />
              <StatCard label="Expenses" value={formatSigned(data.expenses, "Expense", currency, hidden)} tone="plain" />
              <BalanceStat balance={data.balance} currency={currency} hidden={hidden} />
              <StatCard label="Transactions" value={String(data.count)} tone="plain" />
            </div>
            <PreviewTiles data={data.yearData} currency={currency} />
            <div className={styles.grid}>
              <Card radius="lg" padding="24px 28px" paddingMobile="20px" gap="18px" gapMobile="14px">
                <CardTitle>Spending by category</CardTitle>
                {data.hasExpenses ? (
                  <>
                    <CategoryBars rows={data.categoryRows} currency={currency} onSelect={openCategory} />
                    <div className={styles.hint}>Select a category for breakdown, trend &amp; transactions</div>
                  </>
                ) : (
                  <EmptyState icon="trend" title="No expenses in this period" />
                )}
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
function BalanceStat({ balance, currency, hidden }: { balance: number; currency: string; hidden: boolean }) {
  const color = balance >= 0 ? "var(--income)" : "var(--danger)";
  return (
    <Card padding="20px 24px" paddingMobile="16px" gap="6px" gapMobile="4px">
      <div className="stat-label">Balance</div>
      <div className="mono stat-value" style={{ fontWeight: 600, color }}>
        {formatBalance(balance, currency, hidden)}
      </div>
    </Card>
  );
}
