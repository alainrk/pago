import type { ReactNode } from "react";

// Field stacks an upper-case label over a control.
export function Field({ label, htmlFor, children, span2 }: { label: string; htmlFor?: string; children: ReactNode; span2?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, gridColumn: span2 ? "1 / -1" : undefined }}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}
