"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, ClipboardList, LayoutDashboard, Flag, Inbox, Settings, UserRound, LogOut, LogIn, Menu, X, type LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useSignIn } from "@/lib/signInDialog";
import { request } from "@/lib/api";
import { keys } from "@/lib/queries";
import { navigationActive, primaryNavigation, roleHome } from "@/lib/navigation";
import { BrandMark } from "./BrandMark";

interface NavLink { href: string; label: string; icon: LucideIcon }
const NAV_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard, "/issues": ClipboardList, "/report": Flag,
  "/me/reports": ClipboardList, "/work": Inbox, "/admin": Settings,
};
const ACCOUNT_LINKS: NavLink[] = [
  { href: "/me/reports", label: "My reports", icon: ClipboardList },
  { href: "/me/settings", label: "Account settings", icon: Settings },
];

/** Compact role-aware navigation. Endpoints remain the permission boundary. */
export function SiteHeader() {
  const { session, signOut, initialising, authed } = useAuth();
  const { openSignIn } = useSignIn();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menu, setMenu] = useState<"account" | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const accountRef = useRef<HTMLButtonElement>(null);
  const mobileRef = useRef<HTMLButtonElement>(null);
  const close = () => { setMobileOpen(false); setMenu(null); };
  const handleSignOut = () => {
    close();
    void signOut().catch((error: unknown) => {
      window.alert(error instanceof Error ? error.message : "Could not sign out. Please retry.");
    });
  };
  const primaryLinks = primaryNavigation(session?.role).map(link => ({ ...link, icon: NAV_ICONS[link.href] }));
  const municipal = Boolean(session && session.role !== "CITIZEN");
  const accountLinks = [
    ...ACCOUNT_LINKS.filter(link => link.href !== "/me/reports" || (municipal && session?.role !== "ADMIN")),
    ...(session?.role === "STAFF" ? [{ href: "/report", label: "Report a problem", icon: Flag }] : []),
  ];
  const accountActive = pathname.startsWith("/me/settings");
  const identity = useQuery({
    queryKey: ["me", "profile", session?.userId],
    queryFn: () => authed(token => request<{ fullName: string }>("/me/profile", { token })),
    enabled: Boolean(session), staleTime: 60_000,
  });
  const displayName = identity.data?.fullName ?? session?.fullName;
  const unread = useQuery({
    queryKey: keys.myUnread(session?.userId),
    queryFn: () => authed(token => request<{ unread: number }>("/me/notifications/unread-count", { token })),
    enabled: Boolean(session), refetchInterval: 60_000, staleTime: 30_000,
  });
  const unreadCount = unread.data?.unread ?? 0;

  useEffect(() => {
    if (!menu && !mobileOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) { setMenu(null); setMobileOpen(false); }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (menu) { accountRef.current?.focus(); setMenu(null); }
      else { mobileRef.current?.focus(); setMobileOpen(false); }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [menu, mobileOpen]);

  const renderLink = ({ href, label, icon: Icon }: NavLink) => (
    <Link key={href} href={href} onClick={close} aria-current={navigationActive(pathname, href) ? "page" : undefined} className="nav-link">
      <Icon size={18} aria-hidden="true" /><span>{label}</span>
    </Link>
  );

  return (
    <header ref={headerRef} className="site-header">
      <div className="site-header-inner">
        <Link href={roleHome(session?.role)} onClick={close} className="site-logo" aria-label="NagrikSetu home">
          <BrandMark size={36} /><span>Nagrik<span className="brand-setu">Setu</span></span>
        </Link>
        <nav id="site-nav" aria-label="Main" data-open={mobileOpen}>
          <div className="site-links">
            {primaryLinks.map(renderLink)}
            <div className="mobile-secondary">
              {session && <p className="nav-panel-label">Your account</p>}
              {session && accountLinks.map(renderLink)}
              {session && <button type="button" className="nav-link" onClick={handleSignOut}><LogOut size={18} aria-hidden="true" />Sign out</button>}
            </div>
          </div>
        </nav>
        <div className="site-actions">
          {!initialising && session && <>
            <Link href="/me/notifications" onClick={close} className="utility-control notification-control" aria-current={pathname === "/me/notifications" ? "page" : undefined} aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"} title="Notifications">
              <Bell size={20} aria-hidden="true" />{unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </Link>
            <div className="nav-disclosure account-disclosure" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenu(current => current === "account" ? null : current); }}>
              <button ref={accountRef} type="button" className="utility-control" data-active={accountActive} aria-expanded={menu === "account"} aria-controls="account-menu" aria-label="Your account" title={displayName} onClick={() => setMenu(menu === "account" ? null : "account")}><UserRound size={20} aria-hidden="true" /></button>
              <div id="account-menu" className="nav-panel account-menu" data-open={menu === "account"}>
                <div className="account-summary"><strong>{displayName}</strong><span>{session.role.toLowerCase()}</span></div>
                {accountLinks.map(renderLink)}
                <button type="button" className="nav-link" onClick={handleSignOut}><LogOut size={18} aria-hidden="true" />Sign out</button>
              </div>
            </div>
          </>}
          {!initialising && !session && <button type="button" className="sign-in-control" aria-label="Sign in" onClick={() => { close(); openSignIn(); }}><LogIn size={18} aria-hidden="true" /><span>Sign in</span></button>}
          <button ref={mobileRef} type="button" className="utility-control mobile-toggle" aria-label={mobileOpen ? "Close menu" : "Open menu"} aria-expanded={mobileOpen} aria-controls="site-nav" onClick={() => { setMobileOpen(!mobileOpen); setMenu(null); }}>{mobileOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}</button>
        </div>
      </div>
    </header>
  );
}
