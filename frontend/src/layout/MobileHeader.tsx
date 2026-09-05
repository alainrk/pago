import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "./AppShell.module.css";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { Avatar } from "../components/Avatar";
import { useUser } from "../auth/AuthContext";

interface MobileHeaderProps {
  // title with optional right-hand controls (month nav, "September 2026" label...)
  title?: string;
  right?: ReactNode;
  // back renders a back arrow and a smaller title (Add transaction, Settings)
  back?: boolean;
  // brand renders logo + avatar (Dashboard)
  brand?: boolean;
  // tools renders a second row (search, segmented control)
  tools?: ReactNode;
}

// MobileHeader is the white top bar on phones. It renders nothing on desktop.
export function MobileHeader({ title, right, back, brand, tools }: MobileHeaderProps) {
  const navigate = useNavigate();
  const user = useUser();
  // Settings is reached from the avatar at the top left of every page.
  const avatarLink = (
    <Link to="/settings" aria-label="Account settings" style={{ display: "flex", flexShrink: 0 }}>
      <Avatar initials={user.initials} size={30} />
    </Link>
  );
  return (
    <header className={[styles.mHeader, tools ? styles.withTools : ""].join(" ")}>
      <div className={styles.mRow}>
        {brand ? (
          <>
            {avatarLink}
            <Logo size={24} fontSize={16} />
          </>
        ) : back ? (
          <button type="button" className={styles.mBack} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))} aria-label="Back">
            <Icon name="back" size={18} style={{ color: "var(--text-3)" }} />
            <span className={styles.mTitleSm}>{title}</span>
          </button>
        ) : (
          <>
            <div className={styles.mTitleWrap}>
              {avatarLink}
              <div className={styles.mTitle}>{title}</div>
            </div>
            {right}
          </>
        )}
      </div>
      {tools}
    </header>
  );
}
