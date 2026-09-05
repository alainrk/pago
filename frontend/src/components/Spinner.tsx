export function Spinner({ size = 18, label = "Loading" }: { size?: number; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        border: "2px solid var(--brand)",
        borderRightColor: "transparent",
        animation: "spin 700ms linear infinite",
      }}
    />
  );
}

export function PageLoading() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
      <Spinner size={22} />
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" style={{ padding: "14px 16px", borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", color: "var(--danger)", fontSize: 13, display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} style={{ background: "none", border: "none", color: "var(--danger)", fontWeight: 600, fontSize: 13 }}>
          Retry
        </button>
      )}
    </div>
  );
}
