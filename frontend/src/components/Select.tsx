import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import styles from "./Select.module.css";
import { Icon } from "./Icon";
import { useIsMobile } from "../lib/useMediaQuery";

export interface SelectOption {
  value: string;
  label: string;
  // Options with the same group are listed under one heading.
  group?: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  // Shown on the trigger when the value matches no option.
  placeholder?: string;
}

type Row = { kind: "group"; label: string } | { kind: "option"; option: SelectOption; index: number };

// buildRows flattens options into list rows, inserting a heading each time
// the group changes. `index` counts options only, so keyboard navigation can
// skip headings.
function buildRows(options: SelectOption[]): Row[] {
  const rows: Row[] = [];
  let lastGroup: string | undefined;
  options.forEach((option, index) => {
    if (option.group && option.group !== lastGroup) rows.push({ kind: "group", label: option.group });
    lastGroup = option.group;
    rows.push({ kind: "option", option, index });
  });
  return rows;
}

interface Placement {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

const GAP = 6;
const VIEWPORT_PAD = 8;
const MAX_LIST_HEIGHT = 320;

// Select is a styled replacement for the native <select>. On desktop it opens
// a popover under (or above) the trigger; on phones it opens a bottom sheet.
export function Select({ value, options, onChange, ariaLabel, id, className, style, disabled, placeholder = "Select…" }: SelectProps) {
  const isMobile = useIsMobile();
  const reactId = useId();
  const listId = `${reactId}-list`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const typeaheadRef = useRef({ text: "", at: 0 });

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;
  const rows = buildRows(options);

  function openList() {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function closeList(refocus = true) {
    setOpen(false);
    setPlacement(null);
    if (refocus) triggerRef.current?.focus();
  }

  function pick(index: number) {
    const option = options[index];
    if (!option) return;
    if (option.value !== value) onChange(option.value);
    closeList();
  }

  // Desktop placement: measure the trigger and decide whether to open below or above.
  useLayoutEffect(() => {
    if (!open || isMobile) return;
    const compute = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - GAP - VIEWPORT_PAD;
      const above = rect.top - GAP - VIEWPORT_PAD;
      const openUp = below < Math.min(MAX_LIST_HEIGHT, 200) && above > below;
      const maxHeight = Math.min(MAX_LIST_HEIGHT, openUp ? above : below);
      const width = Math.max(rect.width, 180);
      const left = Math.min(rect.left, window.innerWidth - width - VIEWPORT_PAD);
      // When opening upwards the exact height is not known before render, so
      // the element is positioned by its bottom edge (see style below).
      setPlacement({ top: openUp ? -(window.innerHeight - rect.top + GAP) : rect.bottom + GAP, left, width, maxHeight });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [open, isMobile]);

  // Close on outside taps, and on page scrolls that happen outside the list.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      closeList(false);
    };
    const onScroll = (e: Event) => {
      if (isMobile) return;
      if (listRef.current?.contains(e.target as Node)) return;
      closeList(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isMobile]);

  // Focus the list when it opens and keep the active row in view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openList();
    }
  }

  function onListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const last = options.length - 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => Math.min(last, i + 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        return;
      case "Home":
        e.preventDefault();
        setActive(0);
        return;
      case "End":
        e.preventDefault();
        setActive(last);
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        pick(active);
        return;
      case "Escape":
        e.preventDefault();
        closeList();
        return;
      case "Tab":
        closeList(false);
        return;
      default:
        break;
    }
    // Type-ahead: letters typed quickly jump to the next matching option.
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      const prev = typeaheadRef.current;
      const text = (now - prev.at < 700 ? prev.text : "") + e.key.toLowerCase();
      typeaheadRef.current = { text, at: now };
      const start = text.length === 1 ? active + 1 : active;
      for (let step = 0; step < options.length; step++) {
        const i = (start + step) % options.length;
        if (options[i].label.toLowerCase().startsWith(text)) {
          setActive(i);
          return;
        }
      }
    }
  }

  const list = (
    <div
      ref={listRef}
      id={listId}
      role="listbox"
      tabIndex={-1}
      aria-label={ariaLabel}
      aria-activedescendant={`${listId}-${active}`}
      className={isMobile ? styles.sheetList : styles.popover}
      style={
        !isMobile && placement
          ? placement.top < 0
            ? { left: placement.left, minWidth: placement.width, bottom: -placement.top, maxHeight: placement.maxHeight }
            : { left: placement.left, minWidth: placement.width, top: placement.top, maxHeight: placement.maxHeight }
          : undefined
      }
      onKeyDown={onListKeyDown}
    >
      {rows.map((row) =>
        row.kind === "group" ? (
          <div key={`g-${row.label}`} className={styles.group} role="presentation">
            {row.label}
          </div>
        ) : (
          <div
            key={row.option.value}
            id={`${listId}-${row.index}`}
            data-index={row.index}
            role="option"
            aria-selected={row.index === selectedIndex}
            className={[styles.option, row.index === active ? styles.active : "", row.index === selectedIndex ? styles.selected : ""].filter(Boolean).join(" ")}
            onMouseMove={() => {
              if (row.index !== active) setActive(row.index);
            }}
            onClick={() => pick(row.index)}
          >
            <span className={styles.optionLabel}>{row.option.label}</span>
            {row.index === selectedIndex && <Icon name="check" size={14} className={styles.check} />}
          </div>
        ),
      )}
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        className={[styles.trigger, open ? styles.open : "", className ?? ""].filter(Boolean).join(" ")}
        style={style}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={[styles.triggerLabel, selected ? "" : styles.placeholder].filter(Boolean).join(" ")}>{selected ? selected.label : placeholder}</span>
        <Icon name="chevron-down" size={12} className={styles.chevron} />
      </button>
      {open &&
        createPortal(
          isMobile ? (
            <>
              <div className={styles.backdrop} aria-hidden onClick={() => closeList(false)} />
              <div className={styles.sheet}>
                <div className={styles.sheetHead}>
                  <span>{ariaLabel ?? "Choose"}</span>
                  <button type="button" className={styles.sheetClose} aria-label="Close" onClick={() => closeList()}>
                    <Icon name="close" size={14} />
                  </button>
                </div>
                {list}
              </div>
            </>
          ) : (
            list
          ),
          document.body,
        )}
    </>
  );
}
