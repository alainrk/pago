import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  // padding overrides the default "24px 28px" (desktop) and "18px 20px" (mobile).
  padding?: string;
  paddingMobile?: string;
  gap?: string;
  gapMobile?: string;
  radius?: "md" | "lg";
  flush?: boolean;
  children?: ReactNode;
}

export function Card({ padding, paddingMobile, gap, gapMobile, radius = "md", flush, className, style, children, ...rest }: CardProps) {
  const vars: CSSProperties & Record<string, string | undefined> = {
    "--pad": padding,
    "--pad-m": paddingMobile,
    "--gap": gap,
    "--gap-m": gapMobile,
  };
  const cls = [styles.card, radius === "lg" ? styles.lg : "", flush ? styles.flush : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <div className={cls} style={{ ...vars, ...style }} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[styles.title, className ?? ""].join(" ")}>{children}</div>;
}

export function CardSubtitle({ children }: { children: ReactNode }) {
  return <div className={styles.subtitle}>{children}</div>;
}

export function CardHead({ children }: { children: ReactNode }) {
  return <div className={styles.head}>{children}</div>;
}
