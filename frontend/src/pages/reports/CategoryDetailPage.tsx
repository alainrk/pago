import { useParams } from "react-router-dom";
import { Page } from "../../layout/AppShell";
import { MobileHeader } from "../../layout/MobileHeader";
import { PageHeader } from "../../components/PageHeader";
import { PrivacyToggle } from "../../components/PrivacyToggle";
import { Segmented } from "../../components/Segmented";
import { Select } from "../../components/Select";
import { MonthNav } from "../../components/MonthNav";
import { Card, CardTitle } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { PageLoading, ErrorNote } from "../../components/Spinner";
import { BarChart, type BarPoint } from "./BarChart";
import { RANGE_OPTIONS, addDays, elapsedMonths, useReportPeriod, type Range } from "./useReportPeriod";
import { searchAll } from "../../api/searchAll";
import { useQuery } from "../../lib/useQuery";
import { useSwipe } from "../../lib/useSwipe";
import { useUser } from "../../auth/AuthContext";
import { usePrivacy } from "../../lib/privacy";
import { analytics } from "../../api/endpoints";
import { categoryLabel } from "../../lib/categories";
import { formatDayLong, formatMoney, formatSigned, isoDate, MONTHS_SHORT } from "../../lib/format";
import { monthTitle, parseMonthKey, shiftMonth } from "../../lib/month";
import type { CategoryEntry, TransactionDTO } from "../../api/types";
import styles from "./ReportSubpage.module.css";

interface DetailData {
  spent: number;
  count: number;
  // Spend in the previous like-for-like period, and how to name it ("vs Aug").
  prev: number;
  prevLabel: string;
  // Share of the period's total expenses, 0..100.
  share: number;
  yearTotal: number;
  avgPerMonth: number;
  bars: BarPoint[];
  txs: TransactionDTO[];
}

function findEntry(entries: CategoryEntry[] | null, category: string): { amount: number; count: number } {
  const e = (entries ?? []).find((x) => x.category === category);
  return { amount: e?.amount ?? 0, count: e?.count ?? 0 };
}

function sumCategory(txs: TransactionDTO[], category: string): number {
  return txs.reduce((s, t) => (t.type === "Expense" && t.category === category ? s + t.amount : s), 0);
}

// CategoryDetailPage is the drill-down behind a "Spending by category" row:
// what the category cost this period, how that compares to the previous one,
// the 12-month trend and the transactions behind the number.
export function CategoryDetailPage() {
  const { category = "" } = useParams();
  const label = categoryLabel(category);
  const { currency } = useUser();
  const { hidden } = usePrivacy();
  const period = useReportPeriod();
  const { range, monthKey, year, weekKey, week, anchorYear, dateFrom, dateTo } = period;
  const now = new Date();

  const swipe = useSwipe(
    () => {
      if (!period.nextDisabled) period.goNext();
    },
    () => period.goPrev(),
  );

  async function load(signal: AbortSignal): Promise<DetailData> {
    const yearCatsReq = analytics.yearCategories(anchorYear, "Expense", signal);
    const txsReq = searchAll({ category, type: "Expense", dateFrom, dateTo }, signal);

    let spent = 0;
    let count = 0;
    let share = 0;
    let prev = 0;
    let prevLabel = "";
    let txs: TransactionDTO[] = [];
    let highlightMonth: number; // 1..12 in anchorYear

    if (range === "month") {
      const prevKey = shiftMonth(monthKey, -1);
      const [cur, before, list] = await Promise.all([analytics.monthly(monthKey, signal), analytics.monthly(prevKey, signal), txsReq]);
      ({ amount: spent, count } = findEntry(cur.byCategory.Expense, category));
      share = cur.totalExpenses > 0 ? (spent / cur.totalExpenses) * 100 : 0;
      prev = findEntry(before.byCategory.Expense, category).amount;
      prevLabel = `vs ${MONTHS_SHORT[parseMonthKey(prevKey).month - 1]}`;
      txs = list.all;
      highlightMonth = parseMonthKey(monthKey).month;
    } else if (range === "year") {
      const [cur, before, list] = await Promise.all([analytics.year(year, signal), analytics.year(year - 1, signal), txsReq]);
      ({ amount: spent, count } = findEntry(cur.byCategory.Expense, category));
      share = cur.totalExpenses > 0 ? (spent / cur.totalExpenses) * 100 : 0;
      prev = findEntry(before.byCategory.Expense, category).amount;
      prevLabel = `vs ${year - 1}`;
      txs = list.all;
      highlightMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
    } else {
      const prevFrom = isoDate(addDays(week.from, -7));
      const prevTo = isoDate(addDays(week.to, -7));
      const [cur, before] = await Promise.all([
        searchAll({ dateFrom, dateTo }, signal),
        searchAll({ category, type: "Expense", dateFrom: prevFrom, dateTo: prevTo }, signal),
      ]);
      txs = cur.all.filter((t) => t.type === "Expense" && t.category === category);
      spent = sumCategory(cur.all, category);
      count = txs.length;
      const total = cur.all.reduce((s, t) => (t.type === "Expense" ? s + t.amount : s), 0);
      share = total > 0 ? (spent / total) * 100 : 0;
      prev = sumCategory(before.all, category);
      prevLabel = "vs last week";
      highlightMonth = week.from.getMonth() + 1;
    }

    const yearCats = await yearCatsReq;
    const entry = yearCats.categories.find((c) => c.category === category);
    const byMonth = entry?.byMonth ?? new Array<number>(12).fill(0);
    const yearTotal = entry?.total ?? 0;
    const elapsed = elapsedMonths(anchorYear, now);
    const bars: BarPoint[] = byMonth.map((v, i) => ({ label: MONTHS_SHORT[i], value: v, highlight: i + 1 === highlightMonth }));

    return { spent, count, prev, prevLabel, share, yearTotal, avgPerMonth: elapsed > 0 ? yearTotal / elapsed : 0, bars, txs };
  }

  const { data, error, loading, reload } = useQuery(load, [category, range, monthKey, year, weekKey]);

  const periodWord = range === "month" ? "month" : range === "year" ? "year" : "week";
  const shareOf = range === "month" ? MONTHS_SHORT[parseMonthKey(monthKey).month - 1] : range === "year" ? String(year) : "week";
  const subtitle = `${range === "month" ? monthTitle(monthKey, true) : period.shortTitle}${data ? ` · ${data.count} transaction${data.count === 1 ? "" : "s"}` : ""}`;
  const backTo = `/reports${period.search}`;

  const scopeSelect = (
    <Select
      value={range}
      options={RANGE_OPTIONS}
      onChange={(v) => period.setRange(v as Range)}
      ariaLabel="Period scope"
      style={{ "--h": "34px", width: "auto", fontSize: 13, borderRadius: "var(--r-pill)" } as never}
    />
  );

  return (
    <>
      <MobileHeader
        back
        backTo={backTo}
        title={label}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <PrivacyToggle size={30} iconSize={14} />
            {scopeSelect}
          </div>
        }
      />
      <Page {...swipe}>
        <PageHeader
          title={label}
          backTo={backTo}
          left={<Segmented options={RANGE_OPTIONS} value={range} onChange={period.setRange} size="md" ariaLabel="Period scope" />}
          right={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <PrivacyToggle />
              <MonthNav variant="md" title={period.title} onPrev={period.goPrev} onNext={period.goNext} nextDisabled={period.nextDisabled} />
            </div>
          }
        />
        <div className={`${styles.subtitle} ${styles.mobileSub}`}>{subtitle}</div>
        {error ? (
          <ErrorNote message={error} onRetry={reload} />
        ) : loading && !data ? (
          <PageLoading />
        ) : data ? (
          <div className={styles.grid}>
            <div className={styles.column}>
              <Card radius="lg" padding="24px 28px" paddingMobile="18px 20px" gap="14px">
                <div className={styles.heroRow}>
                  <div>
                    <div className={styles.heroLabel}>Spent this {periodWord}</div>
                    <div className={`mono ${styles.heroValue}`}>{formatSigned(data.spent, "Expense", currency, hidden)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className={styles.heroLabel}>{data.prevLabel}</div>
                    <Delta current={data.spent} previous={data.prev} />
                  </div>
                </div>
                <div className={styles.statRow}>
                  <div className={styles.statCell}>
                    <div className={styles.statLabel}>Avg/month {anchorYear}</div>
                    <div className={`mono ${styles.statValue}`}>{formatMoney(data.avgPerMonth, currency, { decimals: false, hidden })}</div>
                  </div>
                  <div className={styles.statCell}>
                    <div className={styles.statLabel}>Share of {shareOf}</div>
                    <div className={`mono ${styles.statValue}`}>{Math.round(data.share)}%</div>
                  </div>
                  <div className={styles.statCell}>
                    <div className={styles.statLabel}>Year total</div>
                    <div className={`mono ${styles.statValue}`}>{formatMoney(data.yearTotal, currency, { decimals: false, hidden })}</div>
                  </div>
                </div>
              </Card>
              <BarChart title={`${label} · by month`} bars={data.bars} currency={currency} avgLine avgOver={elapsedMonths(anchorYear, now)} />
            </div>
            <Card radius="lg" padding="24px 28px" paddingMobile="18px 20px" gap="6px">
              <CardTitle>
                Transactions <span className={styles.subtitle}>· {data.count}</span>
              </CardTitle>
              {data.txs.length === 0 ? (
                <EmptyState icon="credit-card" title="No transactions in this period" />
              ) : (
                <div className={styles.txList}>
                  {data.txs.map((t) => (
                    <div key={t.id} className={styles.txRow}>
                      <div style={{ minWidth: 0 }}>
                        <div className={styles.txName}>{t.description}</div>
                        <div className={styles.txDate}>{formatDayLong(t.date)}</div>
                      </div>
                      <div className={`mono ${styles.txAmount}`}>{formatSigned(t.amount, "Expense", currency, hidden)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        ) : null}
      </Page>
    </>
  );
}

// Delta shows the change against the previous period: red arrow up when
// spending grew, green arrow down when it shrank, muted when there is
// nothing to compare against.
function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) return <div className={`mono ${styles.delta} ${styles.deltaNone}`}>n/a</div>;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <div className={`mono ${styles.delta} ${styles.deltaNone}`}>0%</div>;
  const up = pct > 0;
  return (
    <div className={`mono ${styles.delta} ${up ? styles.deltaUp : styles.deltaDown}`} aria-label={`${up ? "up" : "down"} ${Math.abs(pct)} percent`}>
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </div>
  );
}
