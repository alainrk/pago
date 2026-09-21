import { Link } from "react-router-dom";
import styles from "./PreviewTiles.module.css";
import { Icon } from "../../components/Icon";
import { MiniBars, PairedMiniBars } from "./MiniBars";
import { formatMoney } from "../../lib/format";
import { usePrivacy } from "../../lib/privacy";
import { elapsedMonths } from "./useReportPeriod";
import type { YearAnalyticsResponse } from "../../api/types";

// savingsRate is (income - expenses) / income as a whole percentage, or null
// when there was no income to compare against.
export function savingsRate(income: number, expenses: number): number | null {
  if (income <= 0) return null;
  return Math.round(((income - expenses) / income) * 100);
}

// PreviewTiles are the two cards on the Reports page that lead into the
// Averages and Cash flow views. Both summarise the given year over its
// elapsed months only.
export function PreviewTiles({ data, currency }: { data: YearAnalyticsResponse; currency: string }) {
  const { hidden } = usePrivacy();
  const months = elapsedMonths(data.year);
  const byMonth = [...data.byMonth].sort((a, b) => a.month - b.month).slice(0, months);
  const expenses = byMonth.map((m) => m.expense);
  const avg = months > 0 ? data.totalExpenses / months : 0;
  const rate = savingsRate(data.totalIncome, data.totalExpenses);
  const yearQs = `?year=${data.year}`;

  return (
    <div className={styles.tiles}>
      <Link to={`/reports/averages${yearQs}`} className={styles.tile}>
        <div className={styles.head}>
          <span className={styles.title}>Averages</span>
          <Icon name="arrow-right" size={14} className={styles.chevron} />
        </div>
        <div className={styles.bars}>
          <MiniBars values={expenses} highlight={months - 1} height={22} />
        </div>
        <div className={styles.stat}>
          <span className={`mono ${styles.statValue}`}>{formatMoney(avg, currency, { decimals: false, hidden })}</span>/mo · {data.year}
        </div>
      </Link>
      <Link to={`/reports/cashflow${yearQs}`} className={styles.tile}>
        <div className={styles.head}>
          <span className={styles.title}>Cash flow</span>
          <Icon name="arrow-right" size={14} className={styles.chevron} />
        </div>
        <div className={styles.bars}>
          <PairedMiniBars pairs={byMonth.map((m) => ({ income: m.income, expense: m.expense }))} height={22} />
        </div>
        <div className={styles.stat}>
          savings rate <span className={`mono ${styles.statValue} ${styles.brand}`}>{rate === null ? "n/a" : `${rate}%`}</span>
        </div>
      </Link>
    </div>
  );
}
