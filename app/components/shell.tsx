"use client";
import Link from "next/link";
import { ContactMailSync } from "./portal-data";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Compass,
  Activity,
  Database,
  LayoutDashboard,
  ListChecks,
  Mail,
  Settings2,
  UsersRound,
} from "lucide-react";
import {
  hasUnsavedChanges,
  initializeWorkspace,
  refreshWorkspace,
  useStorageError,
  useStorageStatus,
} from "../lib/store";
const navigation = [
  { href: "/", label: "Overview", english: "Overview", icon: LayoutDashboard },
  {
    href: "/jobs",
    label: "Opportunities",
    english: "Opportunities",
    icon: BriefcaseBusiness,
  },
  {
    href: "/applications",
    label: "Applications",
    english: "Applications",
    icon: ListChecks,
  },
  {
    href: "/people",
    label: "People",
    english: "Your network",
    icon: UsersRound,
  },
  { href: "/agents", label: "Agents", english: "Live reports", icon: Activity },
  { href: "/tasks", label: "Tasks", english: "Shared queue", icon: ListChecks },
  { href: "/data", label: "Data", english: "Saved records", icon: Database },
  { href: "/outreach", label: "Outreach", english: "Outreach", icon: Mail },
  {
    href: "/settings",
    label: "Settings",
    english: "Preferences",
    icon: Settings2,
  },
];
export function Shell({ children, cloud = false }: { children: React.ReactNode; cloud?: boolean }) {
  const pathname = usePathname();
  const error = useStorageError();
  const storageStatus = useStorageStatus();
  useEffect(() => {
    if (pathname === "/login") return;
    void initializeWorkspace();
    const warn = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refreshWorkspace();
    }, 5000);
    return () => {
      window.removeEventListener("beforeunload", warn);
      clearInterval(poll);
    };
  }, [pathname]);
  if (pathname === "/login") return <>{children}</>;
  return (
    <div className="app-shell">
      <ContactMailSync />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Compass size={25} />
          </span>
          <span>
            Career<span className="brand-light">Compass</span>
          </span>
        </Link>
        <div className="workspace">
          <span className="workspace-symbol">C</span>
          <div>
            <strong>Personal workspace</strong>
            <small>YOUR NEXT CHAPTER</small>
          </div>
          <span className="tiny-dot" />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {navigation.map(({ href, label, english, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-item ${pathname === href ? "active" : ""}`}
              aria-current={pathname === href ? "page" : undefined}
              aria-label={label}
            >
              <Icon size={19} />
              <span className="nav-copy">
                {label}
                <small>{english}</small>
              </span>
              <span className="nav-mobile">
                {href === "/"
                  ? "Home"
                  : href === "/jobs"
                    ? "Jobs"
                    : href === "/applications"
                      ? "Tracker"
                      : label}
              </span>
              {href === "/outreach" && <span className="nav-li">in</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="setup-card">
            <span className="tiny-dot amber" /> {cloud ? "Private cloud workspace" : "Local workspace"}
            <p>
              Connect your data.
              <br />
              See your next move.
            </p>
            <Link href="/settings">
              Connection settings <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="profile">
            <span className="workspace-symbol">You</span>
            <div>
              <strong>Your career plan</strong>
              <small>US-first · PM / DS / DA</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div>
            <span className="muted">Workspace</span>
            <span className="slash">/</span>
            {navigation.find((n) => n.href === pathname)?.label ??
              "Career Compass"}
          </div>
          <Link href="/settings" className="connection-label">
            <span className="tiny-dot amber" /> Connections & sources{" "}
            <ArrowUpRight size={14} />
          </Link>
          {cloud && <button className="button" onClick={async () => {
            const response = await fetch('/api/auth/logout', {method:'POST'});
            if(response.ok)window.location.reload();
          }}>Sign out</button>}
        </header>
        <main id="main-content" className="page-content">
          <div className="preview-bar">
            <span>
              <span className="preview-dot" />
              Personal workspace{" "}
              <span className="muted">
                · {cloud ? "Persistent cloud database" : "Local database"}. Source leads require employer verification.
              </span>
            </span>
            <span className="preview-storage">{storageStatus}</span>
          </div>
          {error && (
            <p role="alert" className="warning">
              {error}
            </p>
          )}
          <div className="page-body">{children}</div>
          <footer className="page-footer">
            <span>CAREER COMPASS</span>
            <span>One step closer to your next chapter.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
