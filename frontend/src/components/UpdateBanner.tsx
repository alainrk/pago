import { useEffect, useState } from "react";
import { Button } from "./Button";
import { watchForNewBuild } from "../lib/version";
import styles from "./UpdateBanner.module.css";

// UpdateBanner tells the user a new version of Pago is out (see
// lib/version.ts). Refresh reloads the page, which loads the new version.
// It sits at the top of the main column, so it never covers the add
// page's composer or the bottom nav.
export function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  useEffect(() => watchForNewBuild(() => setAvailable(true)), []);
  if (!available) return null;
  return <UpdateBannerView onRefresh={() => window.location.reload()} />;
}

// UpdateBannerView is the banner without the check, so a test can render it.
export function UpdateBannerView({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.banner} role="status">
        <span>A new version of Pago is ready.</span>
        <Button size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
