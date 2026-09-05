export function Avatar({ initials, size = 30 }: { initials: string; size?: number }) {
  const font = size >= 40 ? 14 : size >= 30 ? 12 : 11;
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: "var(--brand-tint)",
        color: "var(--brand-dark)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: font,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}
