import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

export function EmptyState({ icon = "credit-card", title, hint, action }: { icon?: IconName; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "40px 20px", textAlign: "center", color: "var(--muted)" }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--surface-muted)", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={18} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-2)" }}>{title}</div>
      {hint && <div style={{ fontSize: 13, maxWidth: 360, lineHeight: 1.5 }}>{hint}</div>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}
