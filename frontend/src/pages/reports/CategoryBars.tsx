import styles from "./CategoryBars.module.css";
import { ProgressBar } from "../../components/ProgressBar";
import { Icon } from "../../components/Icon";
import { useIsMobile } from "../../lib/useMediaQuery";
import { formatMoney } from "../../lib/format";
import { usePrivacy } from "../../lib/privacy";

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
// on mobile. With onSelect, named rows become buttons with a trailing
// chevron; the merged "Other" row (muted) stays plain because it is not one
// category.
export function CategoryBars({ rows, currency, onSelect }: { rows: CategoryRow[]; currency: string; onSelect?: (key: string) => void }) {
  const mobile = useIsMobile();
  const { hidden } = usePrivacy();
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <div className={styles.rows}>
      {rows.map((r, i) => {
        const labelCls = [styles.label, r.muted ? styles.muted : ""].filter(Boolean).join(" ");
        const tappable = !!onSelect && !r.muted;
        const rowCls = [styles.row, onSelect ? styles.withChevron : "", tappable ? styles.tappable : ""].filter(Boolean).join(" ");
        const content = (
          <>
            <div className={labelCls}>{r.label}</div>
            <ProgressBar pct={(r.amount / max) * 100} tone={i === 0 && !r.muted ? "brand" : "faint"} height={mobile ? 7 : 8} label={`${r.label} ${r.pct}%`} />
            <div className={`mono ${styles.amount}`}>{formatMoney(r.amount, currency, { hidden })}</div>
            <div className={`mono ${styles.pct}`}>{r.pct}%</div>
            {onSelect && <div className={styles.chevron}>{tappable && <Icon name="arrow-right" size={14} />}</div>}
          </>
        );
        return tappable ? (
          <button key={r.key} type="button" className={rowCls} onClick={() => onSelect(r.key)} aria-label={`${r.label}: open breakdown`}>
            {content}
          </button>
        ) : (
          <div key={r.key} className={rowCls}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
