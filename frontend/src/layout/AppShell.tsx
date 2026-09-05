import { useEffect, useRef, type MouseEvent } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import styles from "./AppShell.module.css";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { Avatar } from "../components/Avatar";
import { useUser } from "../auth/AuthContext";
import { ADD_TEXT_INPUT_ID } from "../pages/AddTransactionPage";
import type { IconName } from "../components/icons";

const NAV: { to: string; label: string; mobileLabel: string; icon: IconName }[] = [
  { to: "/", label: "Add transaction", mobileLabel: "Add", icon: "plus" },
  { to: "/transactions", label: "Transactions", mobileLabel: "Activity", icon: "credit-card" },
  { to: "/reports", label: "Reports", mobileLabel: "Reports", icon: "trend" },
];

// The add page is the home page. When the user is already there, the "+"
// button focuses the message input instead of navigating (this also opens
// the keyboard on phones because it runs inside the tap handler).
function focusAddInput(e: MouseEvent, alreadyHome: boolean) {
  if (!alreadyHome) return;
  e.preventDefault();
  document.getElementById(ADD_TEXT_INPUT_ID)?.focus();
}

export function AppShell() {
  const user = useUser();
  const location = useLocation();
  const atHome = location.pathname === "/";
  const tabs = NAV.slice(1);
  const bottomNavRef = useRef<HTMLElement | null>(null);

  // The bottom nav height depends on the phone's safe area, so measure it and
  // publish it as --mobile-nav-h for anything that has to sit above the nav.
  useEffect(() => {
    const el = bottomNavRef.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) root.style.setProperty("--mobile-nav-h", `${Math.round(h)}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--mobile-nav-h");
    };
  }, []);
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Main navigation">
        <Link to="/" className={styles.brand}>
          <Logo size={26} />
        </Link>
        <nav className={styles.nav}>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) => [styles.item, isActive ? styles.active : ""].join(" ")}
              onClick={n.to === "/" ? (e) => focusAddInput(e, atHome) : undefined}
            >
              <Icon name={n.icon} size={16} />
              {n.label}
            </NavLink>
          ))}
          <NavLink to="/settings" className={({ isActive }) => [styles.item, isActive ? styles.active : ""].join(" ")}>
            <Icon name="setting" size={16} />
            Settings
          </NavLink>
        </nav>
        <Link to="/settings" className={styles.user} aria-label="Account settings">
          <Avatar initials={user.initials} />
          <div className={styles.userText}>
            <div className={styles.userName}>{user.name}</div>
            <div className={styles.userMeta}>{user.email || `@${user.username}`}</div>
          </div>
        </Link>
      </aside>
      <div className={styles.main}>
        <Outlet />
      </div>
      <nav ref={bottomNavRef} className={styles.bottomNav} aria-label="Main navigation">
        {tabs.slice(0, 1).map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => [styles.tab, isActive ? styles.active : ""].join(" ")}>
            <Icon name={n.icon} size={20} />
            <div>{n.mobileLabel}</div>
          </NavLink>
        ))}
        <div className={styles.fabWrap}>
          <Link to="/" className={[styles.fab, atHome ? styles.active : ""].join(" ")} aria-label="Add transaction" onClick={(e) => focusAddInput(e, atHome)}>
            <Icon name="plus" size={20} />
          </Link>
        </div>
        {tabs.slice(1).map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => [styles.tab, isActive ? styles.active : ""].join(" ")}>
            <Icon name={n.icon} size={20} />
            <div>{n.mobileLabel}</div>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

// Page wraps the routed content with the standard padding.
export function Page({ children, className, style, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={[styles.content, className ?? ""].join(" ")} style={style} {...rest}>
      {children}
    </div>
  );
}
