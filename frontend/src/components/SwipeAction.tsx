import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent, type MouseEvent as ReactMouseEvent } from "react";
import styles from "./SwipeAction.module.css";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

interface SwipeActionProps {
  label: string;
  icon: IconName;
  onAction: () => void;
  className?: string;
  children: ReactNode;
}

// How wide the revealed action panel is, and how far the row must move
// before letting go fires the action.
const REVEAL = 96;
const TRIGGER = 72;
// Moves shorter than this are taken as a tap, not a swipe.
const DEAD_ZONE = 8;
// A trackpad swipe that pauses this long starts over.
const WHEEL_IDLE_MS = 250;

function clampOffset(dx: number): number {
  if (dx <= 0) return 0;
  if (dx <= REVEAL) return dx;
  // Past the panel the row keeps moving, but with resistance.
  return REVEAL + (dx - REVEAL) * 0.25;
}

// SwipeAction wraps a list row. Swiping it left with a finger, or scrolling
// it sideways on a trackpad, slides the row over and reveals one action.
// Going far enough fires the action.
export function SwipeAction({ label, icon, onAction, className, children }: SwipeActionProps) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean; ignored: boolean } | null>(null);
  const suppressClick = useRef(false);
  const wheel = useRef<{ acc: number; timer: number | null; fired: boolean }>({ acc: 0, timer: null, fired: false });
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  useEffect(
    () => () => {
      if (wheel.current.timer !== null) window.clearTimeout(wheel.current.timer);
    },
    [],
  );

  function fire() {
    setOffset(0);
    onActionRef.current();
  }

  // Touch and pen: drag the row.
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") return;
    suppressClick.current = false;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, ignored: false };
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || d.ignored) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.abs(dx) < DEAD_ZONE && Math.abs(dy) < DEAD_ZONE) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        d.ignored = true;
        return;
      }
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    setOffset(clampOffset(-dx));
  }
  function endDrag(e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    setDragging(false);
    suppressClick.current = true;
    const dx = d.x - e.clientX;
    if (!cancelled && dx >= TRIGGER) fire();
    else setOffset(0);
  }
  // A finished swipe must not also count as a tap on the row.
  function onClickCapture(e: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.stopPropagation();
    e.preventDefault();
  }

  // Trackpad: a sideways scroll on the row behaves like the swipe.
  function onWheel(e: ReactWheelEvent<HTMLDivElement>) {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const w = wheel.current;
    if (w.timer !== null) window.clearTimeout(w.timer);
    w.timer = window.setTimeout(() => {
      w.acc = 0;
      w.fired = false;
      w.timer = null;
      setOffset(0);
    }, WHEEL_IDLE_MS);
    if (w.fired) return;
    w.acc = Math.max(0, Math.min(REVEAL, w.acc + e.deltaX));
    setOffset(w.acc);
    if (w.acc >= TRIGGER) {
      w.fired = true;
      fire();
    }
  }

  const ready = offset >= TRIGGER;
  return (
    <div className={[styles.wrap, className ?? ""].filter(Boolean).join(" ")} style={{ "--reveal": `${REVEAL}px` } as never} onWheel={onWheel}>
      <div className={[styles.action, ready ? styles.ready : ""].filter(Boolean).join(" ")} style={{ opacity: Math.min(1, offset / TRIGGER) }} aria-hidden>
        <Icon name={icon} size={14} />
        <span>{label}</span>
      </div>
      <div
        className={[styles.content, dragging ? styles.dragging : ""].filter(Boolean).join(" ")}
        style={{ transform: offset ? `translateX(${-offset}px)` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
