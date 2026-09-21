import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";

// PageHeader is the desktop title row. Hidden on mobile (MobileHeader takes over).
// backTo adds a back arrow before the title for drill-down pages.
export function PageHeader({ title, right, left, backTo }: { title: string; right?: ReactNode; left?: ReactNode; backTo?: string }) {
  return (
    <div className="page-header">
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {backTo && (
          <Link to={backTo} aria-label="Back" className="page-back">
            <Icon name="back" size={16} />
          </Link>
        )}
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</h1>
        {left}
      </div>
      {right}
    </div>
  );
}
