import type { ReactNode } from "react";

// PageHeader is the desktop title row. Hidden on mobile (MobileHeader takes over).
export function PageHeader({ title, right, left }: { title: string; right?: ReactNode; left?: ReactNode }) {
  return (
    <div className="page-header">
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</h1>
        {left}
      </div>
      {right}
    </div>
  );
}
