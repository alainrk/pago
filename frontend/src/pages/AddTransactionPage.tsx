import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import styles from "./AddTransactionPage.module.css";
import { Page } from "../layout/AppShell";
import { MobileHeader } from "../layout/MobileHeader";
import { Button } from "../components/Button";
import { Card, CardTitle, CardSubtitle } from "../components/Card";
import { Field } from "../components/Field";
import { Segmented, type SegmentedOption } from "../components/Segmented";
import { Select } from "../components/Select";
import { Callout } from "../components/Callout";
import { useToast } from "../components/Toast";
import { useUser, useSessionGuard } from "../auth/AuthContext";
import { useIsMobile } from "../lib/useMediaQuery";
import { useDebounce } from "../lib/useDebounce";
import { useKeyboard } from "../lib/useKeyboardOffset";
import { transactions } from "../api/endpoints";
import { ApiError } from "../api/client";
import type { TransactionDTO, TransactionType } from "../api/types";
import { currencySymbol, formatDayShort, formatMoney, isoDate, parseAmount, toLocalDate } from "../lib/format";
import { categoriesFor, categoryLabel } from "../lib/categories";

// The message input has a stable id so the "+" button in the shell can focus it.
export const ADD_TEXT_INPUT_ID = "add-text";

interface FormState {
  type: TransactionType;
  category: string;
  amount: string;
  description: string;
  date: string;
}

function emptyForm(): FormState {
  return { type: "Expense", category: categoriesFor("Expense")[0], amount: "", description: "", date: isoDate(new Date()) };
}

function dupKeyOf(f: FormState): string {
  return `${f.description}|${f.amount}|${f.date}`;
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toLocalDate(value).getTime());
}

const TYPE_OPTIONS: SegmentedOption<TransactionType>[] = [
  { value: "Expense", label: "Expense", tone: "expense" },
  { value: "Income", label: "Income", tone: "income" },
];

export function AddTransactionPage() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const user = useUser();
  const guard = useSessionGuard();
  const keyboard = useKeyboard();
  useEffect(() => {
    if (!isMobile || !keyboard.open) return;
    document.documentElement.dataset.keyboard = "open";
    return () => {
      delete document.documentElement.dataset.keyboard;
    };
  }, [isMobile, keyboard.open]);
  const [searchParams] = useSearchParams();
  const initialText = searchParams.get("text") ?? "";

  const [inputText, setInputText] = useState(initialText);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<TransactionDTO[]>([]);

  const parseAbortRef = useRef<AbortController | null>(null);
  const autoParsedRef = useRef(false);
  // Key of the last form values whose duplicates we already know, so the
  // background check does not repeat what the parse response just told us.
  const checkedDupKeyRef = useRef("");
  const today = isoDate(new Date());

  function resetForm() {
    parseAbortRef.current?.abort();
    setForm(emptyForm());
    setDuplicates([]);
    setAmountError(null);
    setParsed(false);
    setParsing(false);
  }

  async function runParse(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    parseAbortRef.current?.abort();
    const ctrl = new AbortController();
    parseAbortRef.current = ctrl;
    setParsing(true);
    try {
      const res = await transactions.parse(trimmed, ctrl.signal);
      const next: FormState = {
        type: res.type,
        category: res.category,
        amount: res.amount.toFixed(2),
        description: res.description,
        date: res.date,
      };
      setForm(next);
      checkedDupKeyRef.current = dupKeyOf(next);
      setDuplicates(res.duplicates);
      setAmountError(null);
      setParsed(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (guard(err)) return;
      const message = err instanceof ApiError || err instanceof Error ? err.message : "Something went wrong";
      toast(message, "error");
    } finally {
      if (parseAbortRef.current === ctrl) setParsing(false);
    }
  }

  // Auto-parse once when the page loads with ?text= in the URL.
  useEffect(() => {
    if (autoParsedRef.current) return;
    autoParsedRef.current = true;
    if (initialText.trim()) void runParse(initialText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live duplicate check while editing: debounce, then cancel any in-flight call.
  const debouncedDupKey = useDebounce(dupKeyOf(form), 400);
  useEffect(() => {
    if (debouncedDupKey === checkedDupKeyRef.current) return;
    const amt = parseAmount(form.amount);
    if (amt === null || !isValidDate(form.date)) {
      setDuplicates([]);
      return;
    }
    const ctrl = new AbortController();
    transactions
      .duplicates(form.description.trim(), amt, form.date, ctrl.signal)
      .then((res) => setDuplicates(res.duplicates))
      .catch(() => {
        // A failed background duplicate check is not worth interrupting the user for.
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedDupKey]);

  function handleTypeChange(type: TransactionType) {
    setForm((f) => ({ ...f, type, category: categoriesFor(type)[0] }));
  }

  async function handleSave() {
    const amt = parseAmount(form.amount);
    if (amt === null) {
      setAmountError("Enter a valid amount.");
      return;
    }
    if (!form.category || !isValidDate(form.date)) return;
    setAmountError(null);
    setSaving(true);
    try {
      await transactions.create({ type: form.type, category: form.category, amount: amt, description: form.description.trim(), date: form.date });
      toast("Transaction saved", "success");
      resetForm();
      setInputText("");
    } catch (err) {
      if (guard(err)) return;
      const message = err instanceof ApiError || err instanceof Error ? err.message : "Something went wrong";
      toast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || parsing;
  const firstDuplicate = duplicates[0];
  const amountLabel = `Amount (${currencySymbol(user.currency)})`;

  const messageInput = (
    <input
      id={ADD_TEXT_INPUT_ID}
      className={[styles.parseInput, inputText.trim() ? styles.active : ""].filter(Boolean).join(" ")}
      value={inputText}
      disabled={parsing}
      autoFocus
      autoComplete="off"
      enterKeyHint="go"
      placeholder="e.g. irish pub with laura 12.50 yesterday"
      aria-label="Message to parse into a transaction"
      onChange={(e) => setInputText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void runParse(inputText);
        }
      }}
    />
  );

  const formGrid = (
    <div className={styles.grid}>
      <Field label={amountLabel} htmlFor="add-amount">
        <input
          id="add-amount"
          className={["input", "is-mono", amountError ? "is-error" : ""].filter(Boolean).join(" ")}
          inputMode="decimal"
          placeholder="0.00"
          value={form.amount}
          disabled={busy}
          onChange={(e) => {
            setForm((f) => ({ ...f, amount: e.target.value }));
            if (amountError) setAmountError(null);
          }}
        />
        {amountError && <div className={styles.fieldError}>{amountError}</div>}
      </Field>
      <Field label="Category" htmlFor="add-category">
        <Select
          id="add-category"
          ariaLabel="Category"
          value={form.category}
          disabled={busy}
          options={categoriesFor(form.type).map((cat) => ({ value: cat, label: categoryLabel(cat) }))}
          onChange={(category) => setForm((f) => ({ ...f, category }))}
        />
      </Field>
      <Field label="Description" htmlFor="add-description" span2>
        <input
          id="add-description"
          className="input"
          placeholder="What was it for?"
          value={form.description}
          disabled={busy}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </Field>
      <Field label="Date" htmlFor="add-date" span2>
        <input
          id="add-date"
          type="date"
          className="input is-mono"
          value={form.date}
          max={today}
          disabled={busy}
          onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
        />
      </Field>
    </div>
  );

  const duplicateCallout = firstDuplicate ? (
    <div className={styles.dupWrap}>
      <Callout tone="warn" compact={isMobile}>
        <b>Looks like a duplicate.</b> You saved &quot;{firstDuplicate.description}&quot; for {formatMoney(firstDuplicate.amount, user.currency)} on{" "}
        {formatDayShort(firstDuplicate.date)}. Confirm only if this is a new one.
      </Callout>
    </div>
  ) : null;

  const cardTitle = parsed ? "Review and confirm" : "New transaction";
  const cardSubtitle = parsed ? "Prefilled from your message. Edit anything, or save as is." : "Type a message above and let AI fill this in, or enter it by hand.";

  const formCard = (
    <Card flush radius="lg" className={parsing ? styles.cardParsing : undefined} aria-busy={parsing || undefined}>
      <div className={styles.cardHeader}>
        <div>
          <CardTitle className={styles.reviewTitle}>{cardTitle}</CardTitle>
          {!isMobile && <CardSubtitle>{cardSubtitle}</CardSubtitle>}
        </div>
        {!isMobile && <Segmented options={TYPE_OPTIONS} value={form.type} onChange={handleTypeChange} size="sm" ariaLabel="Transaction type" />}
      </div>
      {isMobile && (
        <div className={styles.typeRow}>
          <Segmented options={TYPE_OPTIONS} value={form.type} onChange={handleTypeChange} size="lg" full ariaLabel="Transaction type" />
        </div>
      )}
      {formGrid}
      {duplicateCallout}
      {!isMobile && (
        <div className={styles.footer}>
          <Button variant="primary" icon="check" loading={saving} disabled={parsing} onClick={() => void handleSave()}>
            Confirm and save
          </Button>
          <Button variant="ghost" disabled={busy} onClick={resetForm}>
            Clear
          </Button>
        </div>
      )}
    </Card>
  );

  if (isMobile) {
    // The composer is pinned to the bottom of the screen. When the keyboard
    // opens the bottom nav hides (see the data-keyboard rule in AppShell.css)
    // and the composer sits right on top of the keyboard, whether the browser
    // covers the page with it or shrinks the viewport. The form above scrolls.
    const composerBottom = keyboard.open ? `${keyboard.offset}px` : "var(--mobile-nav-h)";
    return (
      <>
        <MobileHeader brand />
        <Page className={styles.mobilePage}>
          {formCard}
          <div className={styles.mobileFooter}>
            <Button variant="primary" size="lg" style={{ "--h": "50px" } as never} icon="check" loading={saving} disabled={parsing} full onClick={() => void handleSave()}>
              Confirm and save
            </Button>
            <Button variant="secondary" style={{ "--h": "46px" } as never} disabled={busy} full onClick={resetForm}>
              Clear
            </Button>
          </div>
        </Page>
        <div className={styles.composer} style={{ bottom: composerBottom }}>
          {messageInput}
          <Button variant="secondary" full icon="sparks" style={{ "--h": "46px" } as never} loading={parsing} disabled={!inputText.trim()} onClick={() => void runParse(inputText)}>
            Parse with AI
          </Button>
        </div>
      </>
    );
  }

  return (
    <Page>
      <div className={styles.column}>
        <h1 className={styles.title}>Add transaction</h1>
        <div className={styles.topRow}>
          {messageInput}
          <Button variant="primary" size="lg" icon="sparks" loading={parsing} disabled={!inputText.trim()} onClick={() => void runParse(inputText)}>
            Parse
          </Button>
        </div>
        {formCard}
      </div>
    </Page>
  );
}
