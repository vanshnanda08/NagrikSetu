import type { Role } from "./auth";
import { safeRedirect } from "./safeRedirect";

export interface NavigationLink { href: string; label: string }

/** Each role starts with its own day-to-day workspace. */
export function roleHome(role?: Role): string {
  if (role === "STAFF" || role === "SUPERVISOR") return "/work";
  if (role === "ADMIN") return "/admin";
  return "/dashboard";
}

export function primaryNavigation(role?: Role): NavigationLink[] {
  const browse = { href: "/issues", label: "Explore issues" };
  const overview = { href: "/dashboard", label: "City overview" };
  if (role === "STAFF") return [{ href: "/work", label: "Complaints" }, browse, { href: "/dashboard", label: "Department overview" }];
  if (role === "SUPERVISOR") return [{ href: "/work", label: "Complaints" }, browse, overview];
  if (role === "ADMIN") return [
    { href: "/admin", label: "Administration" },
    { href: "/work", label: "Complaints" }, browse, overview,
  ];
  return [
    { href: "/dashboard", label: "Dashboard" },
    browse, { href: "/report", label: "Report a problem" },
    ...(role === "CITIZEN" ? [{ href: "/me/reports", label: "My reports" }] : []),
  ];
}

export function navigationActive(path: string, href: string): boolean {
  if (href === "/issues" && path === "/map") return true;
  if (href === "/work" && (path.startsWith("/supervisor/") || path.startsWith("/staff/"))) return true;
  if (href === "/me/reports" && path.startsWith("/me/verify/")) return true;
  return path === href || path.startsWith(`${href}/`);
}

export type WorkView = "mine" | "assignments" | "review" | "performance";

export function canSupervise(role?: Role): boolean {
  return role === "SUPERVISOR" || role === "ADMIN";
}

export function workViews(role?: Role): NavigationLink[] {
  return [
    ...(role === "ADMIN" ? [] : [{ href: "/work?view=mine", label: "My work" }]),
    ...(canSupervise(role) ? [
      { href: "/work?view=assignments", label: "Assignments" },
      { href: "/work?view=review", label: "Needs review" },
      { href: "/work?view=performance", label: "Team performance" },
    ] : []),
  ];
}

/** A fixed internal destination; changing selection retains the active queue. */
export function workHref(query: string, updates: Record<string, string | null>): string {
  const params = new URLSearchParams(query);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  return `/work${params.size ? `?${params}` : ""}`;
}

/** Full ticket details return to the same queue, filter, page and selected issue. */
export function ticketDetailsHref(issueId: string, workQuery: string): string {
  const returnTo = workHref(workQuery, { issue: issueId });
  return `/issues/${encodeURIComponent(issueId)}?${new URLSearchParams({ returnTo })}`;
}

/** The contextual back link accepts only this application's work workspace. */
export function ticketWorkReturn(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || safeRedirect(value) === "/") return null;
  const url = new URL(value, "https://civictrack.invalid");
  return url.pathname === "/work" ? `/work${url.search}` : null;
}

export const ADMIN_VIEWS = [
  { href: "/admin", label: "Configuration" },
  { href: "/admin?view=audit", label: "Audit log" },
] as const;

export const ACCOUNT_VIEWS = [
  { href: "/me/settings", label: "Profile & preferences" },
  { href: "/me/settings?tab=security", label: "Security" },
] as const;

/** Retain shared filters, list paging and map position when changing views. */
export function complaintViewHref(query: string, view: "list" | "map"): string {
  const params = new URLSearchParams(query);
  if (view === "map") params.set("view", "map");
  else params.delete("view");
  const suffix = params.toString();
  return `/issues${suffix ? `?${suffix}` : ""}`;
}
