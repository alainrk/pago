import type { ReactNode } from "react";
import { Icon } from "./Icon";

// Callout is the amber notice box used for duplicate and pacing warnings.
export function Callout({ children, tone = "warn", compact }: { children: ReactNode; tone?: "warn" | "danger" | "info"; compact?: boolean }) {
  const palette = {
    warn: { bg: "var(--warn-bg)", border: "var(--warn-border)", icon: "var(--warn-text)", text: "var(--warn-deep)", name: "warning" as const },
    danger: { bg: "var(--danger-bg)", border: "var(--danger-border)", icon: "var(--danger)", text: "var(--danger-text)", name: "warning" as const },
    info: { bg: "var(--brand-soft)", border: "var(--brand-border)", icon: "var(--brand-dark)", text: "var(--brand-darker)", name: "sparks" as const },
  }[tone];
  return (
    <div
      role={tone === "info" ? "status" : "alert"}
      style={{
        display: "flex",
        gap: compact ? 10 : 12,
        padding: compact ? "12px 14px" : "14px 16px",
        borderRadius: 10,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
      }}
    >
      <Icon name={palette.name} size={compact ? 15 : 17} style={{ color: palette.icon, marginTop: 1 }} />
      <div style={{ fontSize: compact ? 12 : 13, color: palette.text, lineHeight: 1.5, minWidth: 0 }}>{children}</div>
    </div>
  );
}
