import type { CSSProperties } from "react";

// BrandLinks is the small "part of faccio" line with the landing page,
// privacy, terms and the contact address.
const LINKS = [
  { href: "https://faccio.app/pago", label: "About Pago" },
  { href: "https://faccio.app/privacy", label: "Privacy" },
  { href: "https://faccio.app/terms", label: "Terms" },
  { href: "mailto:info@faccio.app", label: "info@faccio.app" },
];

export function BrandLinks({ style }: { style?: CSSProperties }) {
  return (
    <nav
      aria-label="About"
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "4px 12px",
        fontSize: 12,
        color: "var(--faint)",
        ...style,
      }}
    >
      <span>
        Pago is part of{" "}
        <a href="https://faccio.app" style={{ color: "var(--muted)" }}>
          faccio
        </a>
      </span>
      {LINKS.map((l) => (
        <a key={l.href} href={l.href} style={{ color: "var(--muted)" }}>
          {l.label}
        </a>
      ))}
    </nav>
  );
}
