import styles from "./MiniBars.module.css";

// MIN_STUB keeps empty months visible as a thin base so a row of bars still
// reads as a full period.
const MIN_STUB = 2;

// MiniBars is a label-less bar strip: one bar per value, heights relative to
// the largest value, the highlighted index drawn in teal.
export function MiniBars({ values, highlight, height, gap = 3 }: { values: number[]; highlight?: number; height: number; gap?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div className={styles.row} style={{ height, gap }} aria-hidden>
      {values.map((v, i) => (
        <div key={i} className={[styles.bar, i === highlight ? styles.hi : ""].filter(Boolean).join(" ")} style={{ height: Math.max(MIN_STUB, (v / max) * height) }} />
      ))}
    </div>
  );
}

// PairedMiniBars draws two bars per point (income in teal, expense dim),
// both scaled to the largest value across the two series.
export function PairedMiniBars({ pairs, height, gap = 3 }: { pairs: { income: number; expense: number }[]; height: number; gap?: number }) {
  const max = Math.max(1, ...pairs.flatMap((p) => [p.income, p.expense]));
  return (
    <div className={styles.row} style={{ height, gap }} aria-hidden>
      {pairs.map((p, i) => (
        <div key={i} className={styles.pair}>
          <div className={`${styles.bar} ${styles.hi}`} style={{ height: Math.max(MIN_STUB, (p.income / max) * height) }} />
          <div className={styles.bar} style={{ height: Math.max(MIN_STUB, (p.expense / max) * height) }} />
        </div>
      ))}
    </div>
  );
}
