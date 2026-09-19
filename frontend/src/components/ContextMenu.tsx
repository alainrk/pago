import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./ContextMenu.module.css";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

export interface ContextMenuItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const EDGE = 8;

// ContextMenu is a small right-click menu. It opens at the pointer, stays
// inside the viewport, and closes on any click outside, Escape, scroll, or
// when the window loses focus.
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE));
    const top = Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE));
    setPos({ x: left, y: top });
    el.querySelector<HTMLButtonElement>("button")?.focus();
  }, [x, y]);

  useEffect(() => {
    const close = () => onCloseRef.current();
    const onPointer = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("contextmenu", onPointer, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("contextmenu", onPointer, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, []);

  // Arrow keys move between items.
  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    if (buttons.length === 0) return;
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  return createPortal(
    <div ref={ref} className={styles.menu} role="menu" tabIndex={-1} style={{ left: pos.x, top: pos.y }} onKeyDown={onMenuKeyDown} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={[styles.item, item.danger ? styles.danger : ""].filter(Boolean).join(" ")}
          onClick={() => {
            onCloseRef.current();
            item.onSelect();
          }}
        >
          {item.icon && <Icon name={item.icon} size={14} className={styles.icon} />}
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
