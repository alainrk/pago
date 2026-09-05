import styles from "./CategoryBars.module.css";
import { ProgressBar } from "../../components/ProgressBar";
import { useIsMobile } from "../../lib/useMediaQuery";
import { formatMoney } from "../../lib/format";

export interface CategoryRow {
  key: string;
  label: string;
  amount: number;
  pct: number;
  muted?: boolean;
}

// CategoryBars renders the "Spending by category" rows: label, progress bar,
// amount and percentage. Only the top category gets the teal bar; the rest
// stay muted so the colour points at one thing. The amount column is hidden
// on mobile.
export function CategoryBars({ rows, currency }: { rows: CategoryRow[]; currency: string }) {
  const mobile = useIsMobile();
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <div className={styles.rows}>
      {rows.map((r, i) => {
        const labelCls = [styles.label, r.muted ? styles.muted : ""].filter(Boolean).join(" ");
        return (
          <div key={r.key} className={styles.row}>
            <div className={labelCls}>{r.label}</div>
            <ProgressBar pct={(r.amount / max) * 100} tone={i === 0 && !r.muted ? "brand" : "faint"} height={mobile ? 7 : 8} label={`${r.label} ${r.pct}%`} />
            <div className={`mono ${styles.amount}`}>{formatMoney(r.amount, currency)}</div>
            <div className={`mono ${styles.pct}`}>{r.pct}%</div>
          </div>
        );
      })}
    </div>
  );
}
