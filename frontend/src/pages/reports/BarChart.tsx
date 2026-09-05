import styles from "./BarChart.module.css";
import { Card, CardTitle } from "../../components/Card";
import { useIsMobile } from "../../lib/useMediaQuery";
import { formatMoney } from "../../lib/format";

export interface BarPoint {
  label: string;
  value: number;
  highlight: boolean;
}

// BarChart is a plain CSS/HTML bar chart (no chart library). Bar heights are
// relative to the tallest bar in the set; the highlighted bar gets the brand
// colour and shows its value above the bar.
export function BarChart({ title, bars, currency }: { title: string; bars: BarPoint[]; currency: string }) {
  const mobile = useIsMobile();
  const max = Math.max(1, ...bars.map((b) => b.value));
  const avg = bars.length ? bars.reduce((sum, b) => sum + b.value, 0) / bars.length : 0;

  return (
    <Card radius="lg" padding="24px 28px" paddingMobile="20px" gap="18px" gapMobile="14px" className={styles.card}>
      <div className={styles.head}>
        <CardTitle>{title}</CardTitle>
        <div className={styles.avg}>
          avg <span className={`mono ${styles.avgValue}`}>{formatMoney(avg, currency, { decimals: false })}</span>
        </div>
      </div>
      <div className={styles.bars}>
        {bars.map((b, i) => {
          const barCls = [styles.bar, b.highlight ? styles.barHighlight : ""].filter(Boolean).join(" ");
          const labelCls = ["mono", styles.label, b.highlight ? styles.labelHighlight : ""].filter(Boolean).join(" ");
          // Months with nothing still get a 3px stub so the row reads as six months.
          const height = `${Math.max(3, (b.value / max) * (mobile ? 150 : 246))}px`;
          return (
            <div key={`${b.label}-${i}`} className={styles.col} title={`${b.label}: ${formatMoney(b.value, currency)}`}>
              {b.highlight && <div className={`mono ${styles.value}`}>{formatMoney(b.value, currency, { decimals: false })}</div>}
              <div className={barCls} style={{ height }} />
              <div className={labelCls}>{b.label}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
