import type { Role } from "./auth";
import type { IssueStatus } from "./status";

export const MIN_CLOSURE_REASON = 20;
export const MAX_CLOSURE_REASON = 2000;

/** Administrator closure never records a repair; the API enforces the transition. */
export const canCloseComplaint = (role: Role | undefined, status: IssueStatus) => role === "ADMIN" && status !== "CLOSED" && status !== "REJECTED";
export const validClosureReason = (reason: string) => reason.trim().length >= MIN_CLOSURE_REASON && reason.length <= MAX_CLOSURE_REASON;
