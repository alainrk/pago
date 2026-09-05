// Logo renders the Cashout mark (a teal ledger receipt) with the lowercase
// wordmark. size is the height of the mark in px; the wordmark and the gap
// scale with it (gap is about 0.35x the mark height, per the brand notes).
export function Logo({ size = 26, wordmark = true, fontSize }: { size?: number; wordmark?: boolean; fontSize?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(size * 0.35) }}>
      <LogoMark size={size} />
      {wordmark && <div style={{ fontSize: fontSize ?? Math.round(size * 0.75), fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1 }}>cashout</div>}
    </div>
  );
}

// LogoMark is the bare glyph. It uses the theme tokens so it stays in step
// with the accent colour.
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false" style={{ display: "block", flexShrink: 0 }}>
      <path d="M13 6 H35 Q38 6 38 9 V40 L34.5 37 L31 40 L27.5 37 L24 40 L20.5 37 L17 40 L13.5 37 L10 40 V9 Q10 6 13 6 Z" fill="var(--brand)" />
      <path d="M16 14 H32 M16 20 H32 M16 26 H24" stroke="var(--on-brand)" strokeWidth={3} strokeLinecap="round" fill="none" />
    </svg>
  );
}
