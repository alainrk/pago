import styles from "./BarChart.module.css";
import { Card, CardTitle } from "../../components/Card";
import { useIsMobile } from "../../lib/useMediaQuery";
import { formatMoney } from "../../lib/format";
import { usePrivacy } from "../../lib/privacy";

export interface BarPoint {
  label: string;
  value: number;
  highlight: boolean;
}

// Bar and label geometry shared with the CSS so the average line can be
// placed in pixels: the tallest bar, and the space the label row takes under
// the bars (bottom padding + label height + column gap).
const BAR_MAX = { desktop: 246, mobile: 150 };
const LABEL_BLOCK = { desktop: 28, mobile: 22 };

// BarChart is a plain CSS/HTML bar chart (no chart library). Bar heights are
// relative to the tallest bar in the set; the highlighted bar gets the brand
// colour and shows its value above the bar. With avgLine a dashed line marks
// the average; avgOver says how many bars the average is taken over when
// trailing bars are not yet elapsed (defaults to all of them).
export function BarChart({ title, bars, currency, avgLine, avgOver }: { title: string; bars: BarPoint[]; currency: string; avgLine?: boolean; avgOver?: number }) {
  const mobile = useIsMobile();
  const { hidden } = usePrivacy();
  const max = Math.max(1, ...bars.map((b) => b.value));
  const barMax = mobile ? BAR_MAX.mobile : BAR_MAX.desktop;
  const n = avgOver ?? bars.length;
  const avg = n > 0 ? bars.slice(0, n).reduce((sum, b) => sum + b.value, 0) / n : 0;
  const avgBottom = (mobile ? LABEL_BLOCK.mobile : LABEL_BLOCK.desktop) + (avg / max) * barMax;

  return (
    <Card radius="lg" padding="24px 28px" paddingMobile="20px" gap="18px" gapMobile="14px" className={styles.card}>
      <div className={styles.head}>
        <CardTitle>{title}</CardTitle>
        <div className={styles.avg}>
          avg <span className={`mono ${styles.avgValue}`}>{formatMoney(avg, currency, { decimals: false, hidden })}</span>
        </div>
      </div>
      <div className={styles.bars}>
        {bars.map((b, i) => {
          const barCls = [styles.bar, b.highlight ? styles.barHighlight : ""].filter(Boolean).join(" ");
          const labelCls = ["mono", styles.label, b.highlight ? styles.labelHighlight : ""].filter(Boolean).join(" ");
          // Months with nothing still get a 3px stub so the row reads as six months.
          const height = `${Math.max(3, (b.value / max) * barMax)}px`;
          return (
            <div key={`${b.label}-${i}`} className={styles.col} title={`${b.label}: ${formatMoney(b.value, currency, { hidden })}`}>
              {b.highlight && <div className={`mono ${styles.value}`}>{formatMoney(b.value, currency, { decimals: false, hidden })}</div>}
              <div className={barCls} style={{ height }} />
              <div className={labelCls}>{b.label}</div>
            </div>
          );
        })}
        {avgLine && avg > 0 && (
          <div className={styles.avgLine} style={{ bottom: avgBottom }} aria-hidden>
            <span className={`mono ${styles.avgTag}`}>avg</span>
          </div>
        )}
      </div>
    </Card>
  );
}
