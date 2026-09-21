import { Page } from "../../layout/AppShell";
import { MobileHeader } from "../../layout/MobileHeader";
import { PageHeader } from "../../components/PageHeader";
import { PrivacyToggle } from "../../components/PrivacyToggle";
import { MonthNav } from "../../components/MonthNav";
import { Card, CardTitle } from "../../components/Card";
import { StatCard } from "../../components/StatCard";
import { ProgressBar } from "../../components/ProgressBar";
import { EmptyState } from "../../components/EmptyState";
import { PageLoading, ErrorNote } from "../../components/Spinner";
import { savingsRate } from "./PreviewTiles";
import { elapsedMonths, useYearParam } from "./useReportPeriod";
import { useQuery } from "../../lib/useQuery";
import { useIsMobile } from "../../lib/useMediaQuery";
import { useSwipe } from "../../lib/useSwipe";
import { useUser } from "../../auth/AuthContext";
import { usePrivacy } from "../../lib/privacy";
import { analytics } from "../../api/endpoints";
import { formatMoney, MONTHS_SHORT } from "../../lib/format";
import type { YearMonthEntry } from "../../api/types";
import styles from "./ReportSubpage.module.css";

const MIN_STUB = 3;

// signed renders a net value without cents: "+€4,620" or "−€312".
function signed(amount: number, currency: string, hidden: boolean): string {
  return `${amount < 0 ? "−" : "+"}${formatMoney(amount, currency, { decimals: false, hidden })}`;
}

interface CashFlowData {
  elapsed: number;
  income: number;
  expenses: number;
  rate: number | null;
  // One entry per elapsed month, January first.
  months: YearMonthEntry[];
  avgNet: number;
}

// CashFlowPage puts income next to expenses month by month and asks the
// simple question: did the year run net positive?
export function CashFlowPage() {
  const { currency } = useUser();
  const { hidden } = usePrivacy();
  const { year, setYear, nextDisabled } = useYearParam();
  const mobile = useIsMobile();
  const now = new Date();

  const swipe = useSwipe(
    () => {
      if (!nextDisabled) setYear(year + 1);
    },
    () => setYear(year - 1),
  );

  async function load(signal: AbortSignal): Promise<CashFlowData> {
    const res = await analytics.year(year, signal);
    const elapsed = elapsedMonths(year, now);
    const months = [...res.byMonth].sort((a, b) => a.month - b.month).slice(0, elapsed);
    const net = months.reduce((s, m) => s + m.income - m.expense, 0);
    return {
      elapsed,
      income: res.totalIncome,
      expenses: res.totalExpenses,
      rate: savingsRate(res.totalIncome, res.totalExpenses),
      months,
      avgNet: elapsed > 0 ? net / elapsed : 0,
    };
  }

  const { data, error, loading, reload } = useQuery(load, [year]);

  const yearNav = (variant: "md" | "sm") => (
    <MonthNav variant={variant} title={String(year)} onPrev={() => setYear(year - 1)} onNext={() => setYear(year + 1)} nextDisabled={nextDisabled} />
  );
  const subtitle = data && data.elapsed > 0 ? `${year} · ${MONTHS_SHORT[0]} – ${MONTHS_SHORT[data.elapsed - 1]}` : String(year);

  const max = data ? Math.max(1, ...data.months.flatMap((m) => [m.income, m.expense])) : 1;
  const maxNet = data ? Math.max(1, ...data.months.map((m) => Math.abs(m.income - m.expense))) : 1;

  return (
    <>
      <MobileHeader
        back
        backTo="/reports"
        title="Cash flow"
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
          title="Cash flow"
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
            <div className={styles.stats3}>
              <StatCard label="Income" value={signed(data.income, currency, hidden)} tone="income" />
              <StatCard label="Expenses" value={`−${formatMoney(data.expenses, currency, { decimals: false, hidden })}`} tone="plain" />
              <StatCard label="Savings rate" value={data.rate === null ? "n/a" : `${data.rate}%`} tone="brand" />
            </div>
            {data.months.length === 0 ? (
              <Card radius="lg">
                <EmptyState icon="trend" title={`No data for ${year}`} />
              </Card>
            ) : (
              <div className={styles.grid}>
                <Card radius="lg" padding="24px 28px" paddingMobile="18px 20px" gap="18px" gapMobile="16px">
                  <div className={styles.flowHead}>
                    <CardTitle>Income vs expenses</CardTitle>
                    <div className={styles.legend}>
                      <span className={styles.legendItem}>
                        <span className={`${styles.swatch} ${styles.swatchIn}`} />
                        In
                      </span>
                      <span className={styles.legendItem}>
                        <span className={styles.swatch} />
                        Out
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className={styles.flowBars}>
                      {data.months.map((m) => (
                        <div
                          key={m.month}
                          className={styles.flowPair}
                          title={`${MONTHS_SHORT[m.month - 1]}: +${formatMoney(m.income, currency, { hidden })} / −${formatMoney(m.expense, currency, { hidden })}`}
                        >
                          <div className={`${styles.flowBar} ${styles.flowBarIn}`} style={{ height: `${Math.max(MIN_STUB, (m.income / max) * 100)}%` }} />
                          <div className={styles.flowBar} style={{ height: `${Math.max(MIN_STUB, (m.expense / max) * 100)}%` }} />
                        </div>
                      ))}
                    </div>
                    <div className={styles.flowLabels}>
                      {data.months.map((m) => (
                        <div key={m.month} className={`mono ${styles.flowLabel}`}>
                          {mobile ? MONTHS_SHORT[m.month - 1][0] : MONTHS_SHORT[m.month - 1]}
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
                <Card radius="lg" padding="24px 28px" paddingMobile="18px 20px" gap="14px" gapMobile="12px">
                  <div className={styles.flowHead}>
                    <CardTitle>Net by month</CardTitle>
                    <div className={styles.subtitle}>
                      avg <span className="mono" style={{ fontWeight: 600, color: "var(--text)" }}>{signed(data.avgNet, currency, hidden)}</span>
                    </div>
                  </div>
                  <div className={styles.netRows}>
                    {data.months.map((m) => {
                      const net = m.income - m.expense;
                      return (
                        <div key={m.month} className={styles.netRow}>
                          <div className={`mono ${styles.netLabel}`}>{MONTHS_SHORT[m.month - 1]}</div>
                          <ProgressBar pct={(Math.abs(net) / maxNet) * 100} tone={net >= 0 ? "brand" : "over"} height={8} label={`${MONTHS_SHORT[m.month - 1]} net`} />
                          <div className={`mono ${styles.netAmount} ${net >= 0 ? styles.positive : styles.negative}`}>{signed(net, currency, hidden)}</div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>
            )}
          </>
        ) : null}
      </Page>
    </>
  );
}
