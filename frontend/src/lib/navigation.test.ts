import { describe, expect, it } from "vitest";
import { complaintViewHref, navigationActive, primaryNavigation, roleHome, workViews, workHref, ticketDetailsHref, ticketWorkReturn } from "./navigation";

describe("consolidated navigation", () => {
  it("keeps citizen tasks together without municipal destinations", () => {
    const links = primaryNavigation("CITIZEN").map(link => link.href);
    expect(links).toEqual(["/dashboard", "/issues", "/report", "/me/reports"]);
    expect(primaryNavigation().some(link => link.href === "/me/reports")).toBe(false);
  });

  it("starts staff and supervisors in the shared workspace", () => {
    expect(roleHome("STAFF")).toBe("/work");
    expect(roleHome("SUPERVISOR")).toBe("/work");
    expect(roleHome("ADMIN")).toBe("/admin");
    expect(primaryNavigation("STAFF").some(link => link.href.startsWith("/admin"))).toBe(false);
    expect(primaryNavigation("SUPERVISOR").some(link => link.href.startsWith("/admin"))).toBe(false);
    expect(primaryNavigation("ADMIN").some(link => link.href === "/work")).toBe(true);
  });

  it("keeps supervisor tools out of staff navigation", () => {
    expect(primaryNavigation("STAFF").find(link => link.href === "/dashboard")?.label).toBe("Department overview");
    expect(primaryNavigation("SUPERVISOR").find(link => link.href === "/dashboard")?.label).toBe("City overview");
    expect(workViews("STAFF").map(link => link.label)).toEqual(["My work"]);
    expect(workViews("SUPERVISOR").map(link => link.label)).toEqual(["My work", "Assignments", "Needs review", "Team performance"]);
    expect(workViews("ADMIN").map(link => link.label)).toEqual(["Assignments", "Needs review", "Team performance"]);
  });

  it("retains the selected queue when opening and closing complaint details", () => {
    const selected = workHref("view=mine&tab=unassigned", { issue: "issue-1" });
    expect(selected).toBe("/work?view=mine&tab=unassigned&issue=issue-1");
    expect(workHref(selected.split("?")[1], { issue: null })).toBe("/work?view=mine&tab=unassigned");
  });

  it("preserves filters, paging and map position across a list/map round trip", () => {
    const query = "status=NEW&category=POTHOLE&ward=12&sort=priority&offset=25&c=30.8%2C75.8%2C31%2C76&z=13";
    const map = new URL(complaintViewHref(query, "map"), "https://example.test");
    expect(map.pathname).toBe("/issues");
    expect(map.searchParams.get("view")).toBe("map");
    const list = new URL(complaintViewHref(map.search, "list"), map.origin);
    expect(list.searchParams.has("view")).toBe(false);
    expect([...list.searchParams]).toEqual([...new URLSearchParams(query)]);
  });

  it("keeps a contextual detail screen associated with its parent navigation", () => {
    expect(navigationActive("/me/verify/issue-1", "/me/reports")).toBe(true);
    expect(navigationActive("/staff/issues/issue-1", "/work")).toBe(true);
    expect(navigationActive("/supervisor/issues/issue-1/cluster", "/work")).toBe(true);
    expect(navigationActive("/admin", "/issues")).toBe(false);
  });

  it("returns full ticket details to the same selected assignment or paged work queue", () => {
    for (const query of ["view=assignments&tab=to_assign&boardOffset=200", "view=mine&tab=all&queueOffset=100", "view=review&reviewOffset=100"]) {
      const details = new URL(ticketDetailsHref("issue-2", `${query}&issue=issue-1`), "https://example.test");
      expect(details.pathname).toBe("/issues/issue-2");
      expect(ticketWorkReturn(details.searchParams.get("returnTo")!)).toBe(`/work?${query}&issue=issue-2`);
    }
  });

  it("refuses external, executable and unrelated contextual return destinations", () => {
    for (const value of [undefined, ["/work"], "https://outside.test/work", "//outside.test/work", "javascript:alert(1)", "/admin", "/work/other", "/\\outside.test/work", "/work\n"]) {
      expect(ticketWorkReturn(value)).toBeNull();
    }
  });
});
