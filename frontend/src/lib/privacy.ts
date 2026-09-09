import { useCallback, useSyncExternalStore } from "react";

// Privacy mode hides amounts on the Activity and Reports pages (like the eye
// icon in banking apps). It is a UI-only flag kept in localStorage so it
// survives reloads. Every page that calls usePrivacy sees the same value.

const STORAGE_KEY = "pago.hideAmounts";
const CHANGE_EVENT = "pago:privacy-change";

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden(hidden: boolean): void {
  try {
    if (hidden) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode, quota). The toggle still
    // works for the current page load through the change event below.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  // "storage" fires when another tab changes the key.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function usePrivacy(): { hidden: boolean; toggle: () => void } {
  const hidden = useSyncExternalStore(subscribe, readHidden, () => false);
  const toggle = useCallback(() => writeHidden(!readHidden()), []);
  return { hidden, toggle };
}
