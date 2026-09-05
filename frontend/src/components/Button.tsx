import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "icon";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconSize?: number;
  loading?: boolean;
  full?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconSize,
  loading = false,
  full = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  const cls = [styles.btn, styles[variant], variant === "icon" ? "" : styles[size], full ? styles.full : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  const defaultIcon = size === "lg" ? 16 : size === "sm" ? 14 : 15;
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className={styles.spinner} aria-hidden /> : icon ? <Icon name={icon} size={iconSize ?? defaultIcon} /> : null}
      {children}
    </button>
  );
}
