import { useLocation } from "react-router-dom";
import { movedTarget } from "../lib/domains";

// MovedBanner tells people on the old address that the app has a new one.
// It only shows on the hosts listed in VITE_MOVED_FROM_HOSTS, so the same
// build can run on the old and the new address (see lib/domains.ts).
export function MovedBanner() {
  const location = useLocation();
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const target = movedTarget(
    host,
    import.meta.env.VITE_MOVED_FROM_HOSTS,
    import.meta.env.VITE_MOVED_TO_URL,
    `${location.pathname}${location.search}`,
  );
  if (!target) return null;

  const newHost = new URL(target).host;
  const byDate = (import.meta.env.VITE_MOVED_BY_DATE ?? "").trim();

  return (
    <div
      role="status"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px 14px",
        padding: "calc(env(safe-area-inset-top, 0px) + 10px) 16px 10px",
        background: "var(--brand-soft)",
        borderBottom: "1px solid var(--brand-border)",
        color: "var(--brand-darker)",
        fontSize: 13,
        lineHeight: 1.45,
        textAlign: "center",
      }}
    >
      <span>
        Pago has a new address: <strong>{newHost}</strong>.{" "}
        {byDate ? `Please switch before ${byDate}. ` : ""}Your data stays the same, just sign in again there.
      </span>
      <a
        href={target}
        style={{
          padding: "5px 12px",
          borderRadius: 8,
          background: "var(--brand)",
          color: "var(--on-brand)",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        Open the new address
      </a>
    </div>
  );
}
