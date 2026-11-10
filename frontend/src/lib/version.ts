// The "new version" check behind UpdateBanner. Pago has no service worker,
// so a fresh open always loads the latest app. But an installed app (or a
// tab) can stay open for days and keep running the old code. So the build
// writes its id to /version.json (vite.config.ts), and the app compares
// it with the id it was built with each time it comes back to the
// foreground, and every half hour while it stays in view.

const CHECK_EVERY_MS = 30 * 60 * 1000;

// isNewBuild says whether /version.json's body names a build other than
// the one running. Anything unexpected (no body, a missing or empty id)
// counts as "no", so a bad response never shows the banner.
export function isNewBuild(current: string, body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const build = (body as { build?: unknown }).build;
  return typeof build === "string" && build !== "" && build !== current;
}

async function fetchIsNewBuild(): Promise<boolean> {
  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    if (!res.ok) return false;
    return isNewBuild(__BUILD_ID__, await res.json());
  } catch {
    // Offline, or not JSON: try again next time.
    return false;
  }
}

// watchForNewBuild calls onNewBuild once a newer build is out, then stops
// checking. Production builds only: the dev server has no version.json.
// Returns a function that stops the checks.
export function watchForNewBuild(onNewBuild: () => void): () => void {
  if (!import.meta.env.PROD) return () => {};

  let stopped = false;
  const check = async () => {
    if (stopped || document.visibilityState !== "visible") return;
    if (await fetchIsNewBuild()) {
      stop();
      onNewBuild();
    }
  };
  const onVisibility = () => void check();
  const timer = window.setInterval(check, CHECK_EVERY_MS);
  document.addEventListener("visibilitychange", onVisibility);

  function stop() {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  }
  return stop;
}
