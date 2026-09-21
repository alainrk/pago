import { Page } from "../../layout/AppShell";
import { MobileHeader } from "../../layout/MobileHeader";
import { PageHeader } from "../../components/PageHeader";
import { PrivacyToggle } from "../../components/PrivacyToggle";
import { MonthNav } from "../../components/MonthNav";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { PageLoading, ErrorNote } from "../../components/Spinner";
import { MiniBars } from "./MiniBars";
import { elapsedMonths, useYearParam } from "./useReportPeriod";
import { useQuery } from "../../lib/useQuery";
import { useSwipe } from "../../lib/useSwipe";
import { useUser } from "../../auth/AuthContext";
import { usePrivacy } from "../../lib/privacy";
import { analytics } from "../../api/endpoints";
import { categoryLabel } from "../../lib/categories";
import { formatMoney, MONTHS_SHORT } from "../../lib/format";
import styles from "./ReportSubpage.module.css";

interface CategoryAvg {
  key: string;
  label: string;
  avg: number;
  // Monthly totals for the elapsed months only.
  months: number[];
  minIdx: number;
  maxIdx: number;
}

interface AveragesData {
  elapsed: number;
  totalAvg: number;
  cheapest: { idx: number; total: number } | null;
  priciest: { idx: number; total: number } | null;
  categories: CategoryAvg[];
}

function extremes(values: number[]): { minIdx: number; maxIdx: number } {
  let minIdx = 0;
  let maxIdx = 0;
  values.forEach((v, i) => {
    if (v < values[minIdx]) minIdx = i;
    if (v > values[maxIdx]) maxIdx = i;
  });
  return { minIdx, maxIdx };
}

// AveragesPage answers "how much do I spend per month per category in a
// year?". Averages divide by the months that have started, so a year in
// progress is not dragged down by the months still to come.
export function AveragesPage() {
  const { currency } = useUser();
  const { hidden } = usePrivacy();
  const { year, setYear, nextDisabled } = useYearParam();
  const now = new Date();

  const swipe = useSwipe(
    () => {
      if (!nextDisabled) setYear(year + 1);
    },
    () => setYear(year - 1),
  );

  async function load(signal: AbortSignal): Promise<AveragesData> {
    const res = await analytics.yearCategories(year, "Expense", signal);
    const elapsed = elapsedMonths(year, now);
    const monthTotals = new Array<number>(elapsed).fill(0);
    const categories: CategoryAvg[] = [];
    for (const c of res.categories) {
      if (c.total <= 0) continue;
      const months = c.byMonth.slice(0, elapsed);
      months.forEach((v, i) => (monthTotals[i] += v));
      categories.push({ key: c.category, label: categoryLabel(c.category), avg: elapsed > 0 ? c.total / elapsed : 0, months, ...extremes(months) });
    }
    categories.sort((a, b) => b.avg - a.avg);
    const grand = monthTotals.reduce((s, v) => s + v, 0);
    const { minIdx, maxIdx } = extremes(monthTotals);
    return {
      elapsed,
      totalAvg: elapsed > 0 ? grand / elapsed : 0,
      cheapest: elapsed > 0 ? { idx: minIdx, total: monthTotals[minIdx] } : null,
      priciest: elapsed > 0 ? { idx: maxIdx, total: monthTotals[maxIdx] } : null,
      categories,
    };
  }

  const { data, error, loading, reload } = useQuery(load, [year]);

  const yearNav = (variant: "md" | "sm") => (
    <MonthNav variant={variant} title={String(year)} onPrev={() => setYear(year - 1)} onNext={() => setYear(year + 1)} nextDisabled={nextDisabled} />
  );
  const subtitle = `Avg spend per month · ${year}`;
  const monthSpan = data && data.elapsed > 0 ? `${MONTHS_SHORT[0]} – ${MONTHS_SHORT[data.elapsed - 1]}` : "";

  return (
    <>
      <MobileHeader
        back
        backTo="/reports"
        title="Averages"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <PrivacyToggle size={30} iconSize={14} />
            {yearNav("sm")}
          </div>
        }
      />
      <Page {...swipe}>
        <PageHeader
          backTo="/reports"
          title="Averages"
          left={<span className={styles.subtitle}>{subtitle}</span>}
          right={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <PrivacyToggle />
              {yearNav("md")}
            </div>
          }
        />
        <div className={`${styles.subtitle} ${styles.mobileSub}`}>{subtitle}</div>
        {error ? (
          <ErrorNote message={error} onRetry={reload} />
        ) : loading && !data ? (
          <PageLoading />
        ) : data ? (
          <>
            <Card radius="lg" padding="20px 28px" paddingMobile="16px 20px" className={styles.avgSummary}>
              <div className={styles.statRow} style={{ paddingTop: 0, borderTop: "none" }}>
                <div className={styles.statCell}>
                  <div className={styles.statLabel}>All categories</div>
                  <div className={`mono ${styles.statValue}`} style={{ fontSize: 20, fontWeight: 700 }}>
                    {formatMoney(data.totalAvg, currency, { decimals: false, hidden })}
                    <span className={styles.statUnit}>/mo</span>
                  </div>
                </div>
                <div className={styles.statCell}>
                  <div className={styles.statLabel}>Cheapest month</div>
                  <div className={`mono ${styles.statValue} ${styles.positive}`} style={{ marginTop: 8 }}>
                    {data.cheapest ? `${MONTHS_SHORT[data.cheapest.idx]} · ${formatMoney(data.cheapest.total, currency, { decimals: false, hidden })}` : "n/a"}
                  </div>
                </div>
                <div className={styles.statCell}>
                  <div className={styles.statLabel}>Priciest month</div>
                  <div className={`mono ${styles.statValue} ${styles.negative}`} style={{ marginTop: 8 }}>
                    {data.priciest ? `${MONTHS_SHORT[data.priciest.idx]} · ${formatMoney(data.priciest.total, currency, { decimals: false, hidden })}` : "n/a"}
                  </div>
                </div>
              </div>
            </Card>
            {data.categories.length === 0 ? (
              <Card radius="lg">
                <EmptyState icon="trend" title={`No expenses in ${year}`} />
              </Card>
            ) : (
              <div className={styles.catGrid}>
                {data.categories.map((c) => (
                  <Card key={c.key} radius="lg" padding="18px 22px" paddingMobile="14px 18px" gap="10px" gapMobile="10px">
                    <div className={styles.catHead}>
                      <div className={styles.catName}>{c.label}</div>
                      <div className={`mono ${styles.catAvg}`}>
                        {formatMoney(c.avg, currency, { decimals: false, hidden })}
                        <span className={styles.statUnit}>/mo</span>
                      </div>
                    </div>
                    <MiniBars values={c.months} highlight={c.maxIdx} height={34} gap={4} />
                    <div className={`mono ${styles.catFoot}`}>
                      <span className={styles.positive}>min {formatMoney(c.months[c.minIdx] ?? 0, currency, { decimals: false, hidden })}</span>
                      <span className={styles.catFootMid}>{monthSpan}</span>
                      <span className={styles.negative}>max {formatMoney(c.months[c.maxIdx] ?? 0, currency, { decimals: false, hidden })}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        ) : null}
      </Page>
    </>
  );
}
