import styles from "./MonthNav.module.css";
import { Button } from "./Button";

interface MonthNavProps {
  title: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  prevDisabled?: boolean;
  // "sm" is the compact mobile header version; "center" the mobile dashboard version.
  variant?: "md" | "sm" | "center";
}

export function MonthNav({ title, onPrev, onNext, nextDisabled, prevDisabled, variant = "md" }: MonthNavProps) {
  const size = variant === "md" ? 32 : 30;
  const iconSize = variant === "md" ? 14 : 13;
  const cls = [styles.nav, variant !== "md" ? styles[variant] : ""].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <Button variant="icon" icon="arrow-left" iconSize={iconSize} style={{ "--h": `${size}px` } as never} onClick={onPrev} disabled={prevDisabled} aria-label="Previous period" />
      <div className={styles.title} aria-live="polite">
        {title}
      </div>
      <Button variant="icon" icon="arrow-right" iconSize={iconSize} style={{ "--h": `${size}px` } as never} onClick={onNext} disabled={nextDisabled} aria-label="Next period" />
    </div>
  );
}
