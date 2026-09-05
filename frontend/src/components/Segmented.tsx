import styles from "./Segmented.module.css";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  // tone colours the active label (used by the Expense / Income toggle).
  tone?: "expense" | "income";
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "lg" | "md" | "sm" | "xs";
  full?: boolean;
  ariaLabel?: string;
}

export function Segmented<T extends string>({ options, value, onChange, size = "md", full, ariaLabel }: SegmentedProps<T>) {
  const cls = [styles.wrap, size !== "md" ? styles[size] : "", full ? styles.full : ""].filter(Boolean).join(" ");
  return (
    <div className={cls} role="tablist" aria-label={ariaLabel}>
      {options.map((o) => {
        const active = o.value === value;
        const c = [styles.opt, active ? styles.active : "", o.tone ? styles[o.tone] : ""].filter(Boolean).join(" ");
        return (
          <button key={o.value} type="button" role="tab" aria-selected={active} className={c} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
