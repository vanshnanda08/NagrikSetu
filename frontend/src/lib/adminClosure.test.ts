import { describe, expect, it } from "vitest";
import { canCloseComplaint, validClosureReason } from "./adminClosure";
import type { IssueStatus } from "./status";

const states: IssueStatus[] = ["NEW", "ACKNOWLEDGED", "ASSIGNED", "IN_PROGRESS", "PENDING_VERIFICATION", "RESOLVED", "REOPENED", "CLOSED", "REJECTED"];
describe("administrator closure", () => {
  it.each([undefined, "CITIZEN", "STAFF", "SUPERVISOR"] as const)("does not offer closure to %s", role => {
    for (const state of states) expect(canCloseComplaint(role, state)).toBe(false);
  });
  it("offers administrator closure for every nonterminal state", () => {
    for (const state of states) expect(canCloseComplaint("ADMIN", state)).toBe(state !== "CLOSED" && state !== "REJECTED");
  });
  it("requires a meaningful reason and respects the server length limit", () => {
    expect(validClosureReason("done")).toBe(false);
    expect(validClosureReason(" ".repeat(30))).toBe(false);
    expect(validClosureReason("  done                 ")).toBe(false);
    expect(validClosureReason("Reviewed the repaired road and verification outcome.")).toBe(true);
    expect(validClosureReason("x".repeat(2000))).toBe(true);
    expect(validClosureReason("x".repeat(2001))).toBe(false);
  });
});
