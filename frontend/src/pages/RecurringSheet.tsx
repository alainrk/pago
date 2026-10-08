import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./RecurringSheet.module.css";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { Select } from "../components/Select";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { useToast } from "../components/Toast";
import { useSessionGuard } from "../auth/AuthContext";
import { useKeyboardOffset } from "../lib/useKeyboardOffset";
import { categoriesFor, categoryLabel } from "../lib/categories";
import { currencySymbol, parseAmount } from "../lib/format";
import { MAX_DAY, dayFromDate, duePreview, firstDue, formatDue, fromTransaction, monthName, ordinal, todayUTC, withDay, type MakeRecurringPrefill } from "../lib/recurring";
import { recurring as recurringApi } from "../api/endpoints";
import type { RecurringDTO, TransactionType } from "../api/types";

export type RecurringSheetMode = { kind: "create"; prefill?: MakeRecurringPrefill } | { kind: "edit"; rule: RecurringDTO };

interface Draft {
  type: TransactionType;
  category: string;
  amount: string;
  description: string;
  day: number;
}

interface RecurringSheetProps {
  mode: RecurringSheetMode;
  currency: string;
  onClose: () => void;
  onSaved: (rule: RecurringDTO, message: string) => void;
  onDelete: (rule: RecurringDTO) => void;
}

const TYPE_OPTIONS: SegmentedOption<TransactionType>[] = [
  { value: "Expense", label: "Expense", tone: "expense" },
  { value: "Income", label: "Income", tone: "income" },
];

const DAY_OPTIONS = Array.from({ length: MAX_DAY }, (_, i) => ({ value: String(i + 1), label: ordinal(i + 1) }));

function draftFor(mode: RecurringSheetMode, today: string): Draft {
  if (mode.kind === "edit") {
    const r = mode.rule;
    return { type: r.type, category: r.category, amount: r.amount.toFixed(2), description: r.description, day: r.dayOfMonth };
  }
  const p = mode.prefill;
  if (p) {
    const cats = categoriesFor(p.type);
    return { type: p.type, category: cats.includes(p.category) ? p.category : cats[0], amount: p.amount.toFixed(2), description: p.description, day: dayFromDate(p.date) };
  }
  return { type: "Expense", category: categoriesFor("Expense")[0], amount: "", description: "", day: dayFromDate(today) };
}

// RecurringSheet creates or edits a monthly rule. It is a bottom sheet on
// phones and a centered panel on larger screens.
export function RecurringSheet({ mode, currency, onClose, onSaved, onDelete }: RecurringSheetProps) {
  const keyboardOffset = useKeyboardOffset();
  const { toast } = useToast();
  const guard = useSessionGuard();
  const today = todayUTC();
  const [draft, setDraft] = useState<Draft>(() => draftFor(mode, today));
  const [saving, setSaving] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const editing = mode.kind === "edit";
  const prefill = mode.kind === "create" ? mode.prefill : undefined;

  // Keep the page from scrolling behind the sheet, and close on Escape.
  useEffect(() => {
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
  }, []);

  // What the next date will be once saved, and how to say it.
  let next: string;
  let preview: string;
  if (mode.kind === "edit") {
    next = draft.day === mode.rule.dayOfMonth ? mode.rule.nextDueDate : withDay(mode.rule.nextDueDate, draft.day);
    preview = duePreview(next, today, true);
  } else if (prefill && !prefill.linked) {
    const start = fromTransaction(prefill.date, today, draft.day);
    next = start.next;
    preview = start.link
      ? `The one on ${formatDue(prefill.date, today)} counts as ${monthName(prefill.date)}'s. Next one on ${formatDue(next, today)}.`
      : duePreview(next, today, false);
  } else {
    next = firstDue(today, draft.day);
    preview = duePreview(next, today, false);
  }

  function set(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  async function save() {
    const amount = parseAmount(draft.amount);
    if (amount === null) {
      setAmountError("Enter a valid amount.");
      return;
    }
    const description = draft.description.trim();
    if (!description) {
      toast("Add a description, so you can tell your recurring items apart", "error");
      return;
    }
    const input = { type: draft.type, category: draft.category, amount, description, dayOfMonth: draft.day };
    setSaving(true);
    try {
      if (mode.kind === "edit") {
        const rule = await recurringApi.edit(mode.rule.id, input);
        const when = rule.nextDueDate <= today ? "This month's one is added within the hour." : `Next one on ${formatDue(rule.nextDueDate, today)}.`;
        onSaved(rule, `Saved. ${when}`);
      } else {
        const rule = await recurringApi.create({ ...input, sourceTransactionId: prefill?.id });
        onSaved(rule, `Recurring added. ${prefill && !prefill.linked ? "Next" : "First"} one on ${formatDue(rule.nextDueDate, today)}.`);
      }
    } catch (err) {
      if (guard(err)) return;
      toast(err instanceof Error ? err.message : "Could not save", "error");
    } finally {
      setSaving(false);
    }
  }

  const sheetStyle = keyboardOffset > 0 ? { bottom: keyboardOffset, maxHeight: `calc(100dvh - ${keyboardOffset + 12}px)` } : undefined;
  const title = editing ? "Edit recurring" : "New recurring";

  return createPortal(
    <>
      <div className={styles.backdrop} aria-hidden onClick={onClose} />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={title} style={sheetStyle}>
        <div className={styles.head}>
          <div className={styles.headIcon}>
            <Icon name="repeat" size={16} />
          </div>
          <div className={styles.headText}>
            <div className={styles.headTitle}>{title}</div>
            <div className={styles.headSub}>Added every month on the day you pick.</div>
          </div>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className={styles.body}>
          <Segmented options={TYPE_OPTIONS} value={draft.type} onChange={(type) => set({ type, category: categoriesFor(type)[0] })} full ariaLabel="Type" />
          <div className={styles.grid}>
            <Field label={`Amount (${currencySymbol(currency)})`} htmlFor="rec-amount">
              <input
                id="rec-amount"
                className={["input", "is-mono", amountError ? "is-error" : ""].filter(Boolean).join(" ")}
                inputMode="decimal"
                placeholder="0.00"
                value={draft.amount}
                disabled={saving}
                onChange={(e) => {
                  set({ amount: e.target.value });
                  if (amountError) setAmountError(null);
                }}
              />
              {amountError && <div className={styles.fieldError}>{amountError}</div>}
            </Field>
            <Field label="Category" htmlFor="rec-category">
              <Select
                id="rec-category"
                ariaLabel="Category"
                value={draft.category}
                disabled={saving}
                options={categoriesFor(draft.type).map((c) => ({ value: c, label: categoryLabel(c) }))}
                onChange={(category) => set({ category })}
              />
            </Field>
            <Field label="Description" htmlFor="rec-description" span2>
              <input
                id="rec-description"
                className="input"
                placeholder="Rent, Netflix, Salary…"
                value={draft.description}
                disabled={saving}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
            <Field label="Day of month" htmlFor="rec-day" span2>
              <Select id="rec-day" ariaLabel="Day of month" value={String(draft.day)} disabled={saving} options={DAY_OPTIONS} onChange={(v) => set({ day: Number(v) })} />
              <div className={styles.preview}>{preview}</div>
              <div className={styles.hint}>Days 29 to 31 are not offered, so every month has the day.</div>
            </Field>
          </div>
        </div>

        <div className={styles.foot}>
          {editing && (
            <Button variant="ghost" icon="trash" disabled={saving} className={styles.deleteBtn} onClick={() => mode.kind === "edit" && onDelete(mode.rule)}>
              Delete
            </Button>
          )}
          <div className={styles.footMain}>
            <Button variant="secondary" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon="check" loading={saving} onClick={() => void save()}>
              {editing ? "Save changes" : "Add recurring"}
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
