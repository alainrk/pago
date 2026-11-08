import { useEffect, useRef } from "react";
import { Button } from "./Button";

export const PRIVACY_URL = "https://faccio.app/pago/privacy";

// QuickEntryText is the plain explanation shown before the first quick entry
// and next to the switch in Settings. Keep it in line with the privacy policy.
export function QuickEntryText() {
  return (
    <>
      <p style={{ margin: 0 }}>
        Quick entry turns a sentence like &ldquo;pizza 12 euro&rdquo; into a transaction. To do that, the text you type (up to 500
        characters) is sent to <strong>DeepSeek</strong>, an AI company in <strong>China</strong>.
      </p>
      <p style={{ margin: 0 }}>We send only that text: no name, no email, no account id.</p>
      <p style={{ margin: 0 }}>
        The EU does not consider China to offer the same level of data protection as the EU, and Chinese authorities may be able to
        access the data there.
      </p>
      <p style={{ margin: 0 }}>
        If you prefer, the form works just the same. You can change this at any time in Settings.{" "}
        <a href={PRIVACY_URL} target="_blank" rel="noreferrer" style={{ color: "var(--brand-dark)", textDecoration: "underline" }}>
          Privacy policy
        </a>
      </p>
    </>
  );
}

interface QuickEntryConsentProps {
  open: boolean;
  busy: "" | "accept" | "decline";
  onAccept: () => void;
  onDecline: () => void;
  // onClose: closed without a choice (Escape or outside tap). Nothing is saved.
  onClose: () => void;
}

// QuickEntryConsent asks once, before the first quick entry. The two choices
// have the same look and size, and closing the sheet saves nothing.
export function QuickEntryConsent({ open, busy, onAccept, onDecline, onClose }: QuickEntryConsentProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="quick-entry-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
      style={{ padding: 0, maxWidth: 440, width: "calc(100% - 32px)", boxShadow: "var(--shadow-pop)" }}
    >
      <div style={{ padding: "22px 22px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div id="quick-entry-title" style={{ fontSize: 16, fontWeight: 600 }}>
          Before your first quick entry
        </div>
        <div style={{ fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.55, display: "flex", flexDirection: "column", gap: 8 }}>
          <QuickEntryText />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
          <Button variant="secondary" full onClick={onAccept} loading={busy === "accept"} disabled={busy !== ""}>
            Use quick entry
          </Button>
          <Button variant="secondary" full onClick={onDecline} loading={busy === "decline"} disabled={busy !== ""}>
            Use the form
          </Button>
        </div>
      </div>
    </dialog>
  );
}
