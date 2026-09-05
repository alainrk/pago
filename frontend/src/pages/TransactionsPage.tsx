import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Page } from "../layout/AppShell";
import { MobileHeader } from "../layout/MobileHeader";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Select, type SelectOption } from "../components/Select";
import { CategoryPill, CategoryTile } from "../components/CategoryPill";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { PageLoading, ErrorNote, Spinner } from "../components/Spinner";
import { useToast } from "../components/Toast";
import { useUser, useSessionGuard } from "../auth/AuthContext";
import { useDebounce } from "../lib/useDebounce";
import { useIsMobile } from "../lib/useMediaQuery";
import { transactions } from "../api/endpoints";
import { ApiError } from "../api/client";
import type { TransactionDTO, TransactionType } from "../api/types";
import { ALL_CATEGORIES, categoryLabel } from "../lib/categories";
import { MONTHS_LONG, formatDayLong, formatDayShort, formatSigned, isoDate, parseAmount, toLocalDate } from "../lib/format";
import { monthRange } from "../lib/month";
import { TransactionRowEditor, type EditDraft } from "./TransactionRowEditor";
import { TransactionEditSheet } from "./TransactionEditSheet";
import styles from "./TransactionsPage.module.css";

const PAGE_SIZE = 30;
const YEARS_BACK = 10;

function draftFrom(tx: TransactionDTO): EditDraft {
  return { description: tx.description, amount: tx.amount.toFixed(2), category: tx.category, date: isoDate(toLocalDate(tx.date)) };
}

interface DayGroup {
  key: string;
  label: string;
  items: TransactionDTO[];
}

// groupByDay groups an already date-desc-sorted list into per-day buckets,
// preserving the incoming order.
function groupByDay(items: TransactionDTO[]): DayGroup[] {
  const groups: DayGroup[] = [];
  const index = new Map<string, DayGroup>();
  for (const tx of items) {
    const key = isoDate(toLocalDate(tx.date));
    let group = index.get(key);
    if (!group) {
      group = { key, label: formatDayLong(tx.date), items: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.items.push(tx);
  }
  return groups;
}

// A period is either a whole year ("2025") or one month ("2025-09").
function parsePeriod(value: string | null, currentYear: number): string {
  if (!value) return "";
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(value);
  if (!m) return "";
  const year = Number(m[1]);
  if (year < currentYear - YEARS_BACK || year > currentYear) return "";
  if (m[2] !== undefined && (Number(m[2]) < 1 || Number(m[2]) > 12)) return "";
  return value;
}

// dateWindow turns the period filter into the API date range.
function dateWindow(period: string): { dateFrom?: string; dateTo?: string } {
  if (!period) return {};
  if (period.length === 4) return { dateFrom: `${period}-01-01`, dateTo: `${period}-12-31` };
  const { from, to } = monthRange(period);
  return { dateFrom: from, dateTo: to };
}

export function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useUser();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const guard = useSessionGuard();

  const currentYear = new Date().getFullYear();
  const q = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? "";
  const typeParam = searchParams.get("type");
  const type: "" | TransactionType = typeParam === "Income" || typeParam === "Expense" ? typeParam : "";
  const period = parsePeriod(searchParams.get("period"), currentYear);
  const filtersActive = q !== "" || category !== "" || type !== "" || period !== "";

  // Updates one or more filters in the URL. Empty values remove the key.
  function updateParams(patch: Record<string, string | undefined>) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );
  }

  const [searchText, setSearchText] = useState(q);
  const debouncedSearch = useDebounce(searchText, 300);
  useEffect(() => {
    if (debouncedSearch !== q) updateParams({ q: debouncedSearch || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // The list loads page by page as the user scrolls. Every filter change
  // starts over from the first page.
  const { dateFrom, dateTo } = dateWindow(period);
  const filterKey = [q, category, type, dateFrom ?? "", dateTo ?? ""].join("|");
  const [items, setItems] = useState<TransactionDTO[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef({ key: "", count: 0 });
  const inFlightRef = useRef<AbortController | null>(null);

  const loadMore = useCallback(
    (reset: boolean) => {
      inFlightRef.current?.abort();
      const ctrl = new AbortController();
      inFlightRef.current = ctrl;
      const offset = reset ? 0 : loadedRef.current.count;
      setLoading(true);
      setError(null);
      transactions
        .search({ query: q, category, type, dateFrom, dateTo, offset, limit: PAGE_SIZE }, ctrl.signal)
        .then((res) => {
          if (ctrl.signal.aborted) return;
          loadedRef.current = { key: filterKey, count: offset + res.transactions.length };
          setItems((cur) => (reset ? res.transactions : [...cur, ...res.transactions]));
          setTotal(res.total);
          setHasMore(offset + res.transactions.length < res.total && res.transactions.length > 0);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (ctrl.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError(err instanceof ApiError || err instanceof Error ? err.message : "Something went wrong");
          setLoading(false);
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterKey],
  );

  useEffect(() => {
    loadedRef.current = { key: filterKey, count: 0 };
    setItems([]);
    setTotal(null);
    setHasMore(true);
    loadMore(true);
    return () => inFlightRef.current?.abort();
  }, [filterKey, loadMore]);

  // Load the next page when the sentinel at the end of the list comes into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading || error) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore(false);
      },
      { rootMargin: "400px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, error, loadMore, items.length]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TransactionDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(category !== "" || type !== "" || period !== "");

  function clearFilters() {
    setSearchText("");
    updateParams({ q: undefined, category: undefined, type: undefined, period: undefined });
  }

  function startEdit(tx: TransactionDTO) {
    setEditingId(tx.id);
    setDraft(draftFrom(tx));
  }
  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(tx: TransactionDTO) {
    if (!draft) return;
    const amount = parseAmount(draft.amount);
    const description = draft.description.trim();
    if (!description || amount === null) {
      toast("Enter a valid description and amount", "error");
      return;
    }
    const patch: { id: number; description?: string; amount?: number; category?: string; date?: string } = { id: tx.id };
    if (description !== tx.description) patch.description = description;
    if (amount !== tx.amount) patch.amount = amount;
    if (draft.category !== tx.category) patch.category = draft.category;
    if (draft.date !== isoDate(toLocalDate(tx.date))) patch.date = draft.date;
    setSaving(true);
    try {
      const updated = await transactions.edit(patch);
      setItems((cur) => cur.map((t) => (t.id === tx.id ? { ...t, ...updated } : t)));
      cancelEdit();
      toast("Transaction updated");
    } catch (err) {
      if (guard(err)) return;
      toast(err instanceof Error ? err.message : "Could not update the transaction", "error");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await transactions.remove(deleteTarget.id);
      if (editingId === deleteTarget.id) cancelEdit();
      setItems((cur) => cur.filter((t) => t.id !== deleteTarget.id));
      setTotal((t) => (t === null ? t : Math.max(0, t - 1)));
      loadedRef.current.count = Math.max(0, loadedRef.current.count - 1);
      setDeleteTarget(null);
      toast("Transaction deleted");
    } catch (err) {
      if (guard(err)) return;
      toast(err instanceof Error ? err.message : "Could not delete the transaction", "error");
    } finally {
      setDeleting(false);
    }
  }

  const initialLoading = loading && items.length === 0 && !error;
  const countText = total === null ? "…" : `${total} transaction${total === 1 ? "" : "s"}`;

  const categoryOptions: SelectOption[] = [{ value: "", label: "All categories" }, ...ALL_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))];
  const typeOptions: SelectOption[] = [
    { value: "", label: "All types" },
    { value: "Expense", label: "Expenses" },
    { value: "Income", label: "Income" },
  ];

  // One select for the period: every year back to YEARS_BACK, each with a
  // whole-year entry followed by its months, newest first.
  const currentMonth = new Date().getMonth() + 1;
  const periodOptions: SelectOption[] = [{ value: "", label: "All time" }];
  for (let y = currentYear; y >= currentYear - YEARS_BACK; y--) {
    const group = String(y);
    periodOptions.push({ value: group, label: `All of ${y}`, group });
    for (let m = y === currentYear ? currentMonth : 12; m >= 1; m--) {
      periodOptions.push({ value: `${y}-${m < 10 ? `0${m}` : m}`, label: `${MONTHS_LONG[m - 1]} ${y}`, group });
    }
  }

  const selectClass = styles.select36;
  const periodSelect = <Select className={selectClass} value={period} options={periodOptions} onChange={(v) => updateParams({ period: v || undefined })} ariaLabel="Period filter" />;
  const categorySelect = <Select className={selectClass} value={category} options={categoryOptions} onChange={(v) => updateParams({ category: v || undefined })} ariaLabel="Category filter" />;
  const typeSelect = <Select className={selectClass} value={type} options={typeOptions} onChange={(v) => updateParams({ type: v || undefined })} ariaLabel="Type filter" />;

  const mobileTools = (
    <div className={styles.mToolsWrap}>
      <div className={styles.mSearchRow}>
        <div className={styles.mSearchBox}>
          <Icon name="search" size={14} />
          <input
            className={styles.mSearchInput}
            placeholder="Search…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            aria-label="Search transactions"
          />
        </div>
        <button
          type="button"
          className={[styles.mFilterBtn, showMobileFilters ? styles.mFilterBtnActive : ""].join(" ")}
          aria-label="Toggle filters"
          aria-pressed={showMobileFilters}
          onClick={() => setShowMobileFilters((v) => !v)}
        >
          <Icon name="filter" size={15} />
        </button>
        {filtersActive && (
          <button type="button" className={styles.mFilterBtn} aria-label="Clear search and filters" title="Clear" onClick={clearFilters}>
            <Icon name="close" size={15} />
          </button>
        )}
      </div>
      {showMobileFilters && (
        <>
          <div className={styles.mFiltersRow}>{periodSelect}</div>
          <div className={styles.mFiltersRow}>
            {categorySelect}
            {typeSelect}
          </div>
        </>
      )}
    </div>
  );

  const dayGroups = groupByDay(items);
  const editingTx = editingId === null ? null : (items.find((t) => t.id === editingId) ?? null);

  const listEnd = (
    <div ref={sentinelRef} className={styles.listEnd}>
      {error && items.length > 0 ? (
        <ErrorNote message={error} onRetry={() => loadMore(false)} />
      ) : loading && items.length > 0 ? (
        <Spinner size={18} label="Loading more" />
      ) : hasMore ? (
        <Button variant="secondary" size="sm" onClick={() => loadMore(false)}>
          Load more
        </Button>
      ) : items.length > 0 ? (
        <span className={styles.listEndText}>That is everything.</span>
      ) : null}
    </div>
  );

  return (
    <>
      <MobileHeader title="Activity" right={<span className={styles.mCount}>{countText}</span>} tools={mobileTools} />
      <Page>
        <PageHeader title="Transactions" />

        {!isMobile && (
          <div className={styles.filtersRow}>
            <div className={styles.searchBox}>
              <Icon name="search" size={14} />
              <input
                className={styles.searchInput}
                placeholder="Search descriptions…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                aria-label="Search transactions"
              />
            </div>
            {periodSelect}
            {categorySelect}
            {typeSelect}
            {filtersActive && (
              <Button variant="ghost" size="sm" icon="close" onClick={clearFilters}>
                Clear
              </Button>
            )}
            <div className={styles.netText}>{countText}</div>
          </div>
        )}

        {!isMobile &&
          (initialLoading ? (
            <PageLoading />
          ) : error && items.length === 0 ? (
            <ErrorNote message={error} onRetry={() => loadMore(true)} />
          ) : (
            <Card flush radius="md" className={styles.tableCard}>
              <div className={styles.headerRow}>
                <div>Date</div>
                <div>Description</div>
                <div>Category</div>
                <div style={{ textAlign: "right" }}>Amount</div>
                <div />
              </div>
              {items.length === 0 ? (
                <EmptyState icon="credit-card" title="No transactions" hint="Nothing matches these filters." />
              ) : (
                <div className={styles.body}>
                  {items.map((tx) =>
                    editingId === tx.id && draft ? (
                      <TransactionRowEditor
                        key={tx.id}
                        transaction={tx}
                        draft={draft}
                        onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
                        onSave={() => saveEdit(tx)}
                        onCancel={cancelEdit}
                        saving={saving}
                      />
                    ) : (
                      <div key={tx.id} className={styles.row}>
                        <div className={styles.cellDate}>{formatDayShort(tx.date)}</div>
                        <div className={styles.cellDesc}>{tx.description}</div>
                        <div>
                          <CategoryPill category={tx.category} type={tx.type} />
                        </div>
                        <div className={`${styles.cellAmount} ${tx.type === "Income" ? styles.income : ""}`}>
                          {formatSigned(tx.amount, tx.type, user.currency)}
                        </div>
                        <div className={styles.actions}>
                          <button type="button" className={styles.iconBtn} aria-label="Edit transaction" onClick={() => startEdit(tx)}>
                            <Icon name="pencil" size={14} />
                          </button>
                          <button type="button" className={styles.iconBtn} aria-label="Delete transaction" onClick={() => setDeleteTarget(tx)}>
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
              {listEnd}
            </Card>
          ))}

        {isMobile &&
          (initialLoading ? (
            <PageLoading />
          ) : error && items.length === 0 ? (
            <ErrorNote message={error} onRetry={() => loadMore(true)} />
          ) : items.length === 0 ? (
            <EmptyState icon="credit-card" title="No transactions" hint="Nothing matches these filters." />
          ) : (
            <>
              <div className={styles.mList}>
                {dayGroups.map((group) => (
                  <div key={group.key}>
                    <div className={styles.dayHeader}>{group.label}</div>
                    {group.items.map((tx) => (
                      <div key={tx.id}>
                        <div
                          className={styles.mRow}
                          role="button"
                          tabIndex={0}
                          aria-pressed={editingId === tx.id}
                          onClick={() => startEdit(tx)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              startEdit(tx);
                            }
                          }}
                        >
                          <CategoryTile category={tx.category} type={tx.type} />
                          <div className={styles.mRowText}>
                            <div className={styles.mRowDesc}>{tx.description}</div>
                            <div className={styles.mRowCat}>{categoryLabel(tx.category)}</div>
                          </div>
                          <div className={`mono ${styles.mRowAmount} ${tx.type === "Income" ? styles.income : ""}`}>
                            {formatSigned(tx.amount, tx.type, user.currency)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {listEnd}
            </>
          ))}
      </Page>

      {isMobile && (
        <TransactionEditSheet
          transaction={editingTx}
          draft={draft}
          currency={user.currency}
          onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
          onSave={() => editingTx && saveEdit(editingTx)}
          onDelete={() => editingTx && setDeleteTarget(editingTx)}
          onClose={cancelEdit}
          saving={saving}
        />
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete transaction"
        message={deleteTarget ? `Delete "${deleteTarget.description}" (${formatSigned(deleteTarget.amount, deleteTarget.type, user.currency)})? This cannot be undone.` : ""}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
