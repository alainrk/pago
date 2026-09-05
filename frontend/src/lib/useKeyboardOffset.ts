import { useEffect, useState } from "react";

export interface KeyboardState {
  // Pixels of the layout viewport covered by the keyboard. iOS and Android
  // without viewport resizing keep the layout viewport as is, so a fixed
  // bottom bar has to be pushed up by this amount.
  offset: number;
  // True while the keyboard is up, in either mode: covering the page, or
  // shrinking the whole viewport (Android with interactive-widget=resizes-content).
  open: boolean;
}

// The keyboard is considered open when the visual viewport lost at least
// this many pixels compared with the tallest height seen at this width.
const OPEN_THRESHOLD = 150;
// Smaller differences come from browser chrome, not the keyboard.
const COVER_THRESHOLD = 40;

export function useKeyboard(): KeyboardState {
  const [state, setState] = useState<KeyboardState>({ offset: 0, open: false });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let maxHeight = vv.height;
    let width = window.innerWidth;
    const update = () => {
      // A rotation changes the width; start measuring again from there.
      if (window.innerWidth !== width) {
        width = window.innerWidth;
        maxHeight = vv.height;
      }
      maxHeight = Math.max(maxHeight, vv.height);
      const covered = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      const offset = covered > COVER_THRESHOLD ? covered : 0;
      const open = offset > 0 || maxHeight - vv.height > OPEN_THRESHOLD;
      setState((cur) => (cur.offset === offset && cur.open === open ? cur : { offset, open }));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return state;
}

// useKeyboardOffset keeps the old shape for callers that only need the offset.
export function useKeyboardOffset(): number {
  return useKeyboard().offset;
}
