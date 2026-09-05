import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./TransactionEditSheet.module.css";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { Select } from "../components/Select";
import { CategoryTile } from "../components/CategoryPill";
import { useKeyboardOffset } from "../lib/useKeyboardOffset";
import { categoriesFor, categoryLabel } from "../lib/categories";
import { currencySymbol, formatSigned } from "../lib/format";
import type { TransactionDTO } from "../api/types";
import type { EditDraft } from "./TransactionRowEditor";

interface TransactionEditSheetProps {
  transaction: TransactionDTO | null;
  draft: EditDraft | null;
  currency: string;
  onChange: (patch: Partial<EditDraft>) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
  saving: boolean;
}

// TransactionEditSheet is the phone editor: a bottom sheet with full-size
// labelled fields. It moves up with the keyboard so the field being edited
// stays visible.
export function TransactionEditSheet({ transaction, draft, currency, onChange, onSave, onDelete, onClose, saving }: TransactionEditSheetProps) {
  const keyboardOffset = useKeyboardOffset();
  const open = transaction !== null && draft !== null;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Keep the page from scrolling behind the sheet, and close on Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;

  const sheetStyle = keyboardOffset > 0 ? { bottom: keyboardOffset, maxHeight: `calc(100dvh - ${keyboardOffset + 12}px)` } : undefined;

  return createPortal(
    <>
      <div className={styles.backdrop} aria-hidden onClick={onClose} />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Edit transaction" style={sheetStyle}>
        <div className={styles.head}>
          <CategoryTile category={transaction.category} type={transaction.type} />
          <div className={styles.headText}>
            <div className={styles.headTitle}>Edit transaction</div>
            <div className={`mono ${styles.headAmount} ${transaction.type === "Income" ? styles.income : ""}`}>{formatSigned(transaction.amount, transaction.type, currency)}</div>
          </div>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.grid}>
            <Field label={`Amount (${currencySymbol(currency)})`} htmlFor="edit-amount">
              <input
                id="edit-amount"
                className="input is-mono"
                style={{ "--h": "46px" } as never}
                inputMode="decimal"
                value={draft.amount}
                disabled={saving}
                onChange={(e) => onChange({ amount: e.target.value })}
              />
            </Field>
            <Field label="Category" htmlFor="edit-category">
              <Select
                id="edit-category"
                ariaLabel="Category"
                style={{ "--h": "46px" } as never}
                value={draft.category}
                disabled={saving}
                options={categoriesFor(transaction.type).map((c) => ({ value: c, label: categoryLabel(c) }))}
                onChange={(category) => onChange({ category })}
              />
            </Field>
            <Field label="Description" htmlFor="edit-description" span2>
              <input
                id="edit-description"
                className="input"
                style={{ "--h": "46px" } as never}
                value={draft.description}
                disabled={saving}
                onChange={(e) => onChange({ description: e.target.value })}
              />
            </Field>
            <Field label="Date" htmlFor="edit-date" span2>
              <input
                id="edit-date"
                type="date"
                className="input is-mono"
                style={{ "--h": "46px" } as never}
                value={draft.date}
                disabled={saving}
                onChange={(e) => onChange({ date: e.target.value })}
              />
            </Field>
          </div>
        </div>

        <div className={styles.foot}>
          <Button variant="primary" size="lg" full icon="check" loading={saving} style={{ "--h": "50px" } as never} onClick={onSave}>
            Save changes
          </Button>
          <Button variant="outline" full disabled={saving} icon="trash" style={{ "--h": "46px", color: "var(--danger)", borderColor: "var(--danger-border)" } as never} onClick={onDelete}>
            Delete transaction
          </Button>
        </div>
      </div>
    </>,
    document.body,
  );
}
