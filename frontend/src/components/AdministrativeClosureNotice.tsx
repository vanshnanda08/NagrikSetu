import type { IssueStatus } from "@/lib/status";

/** Closure is terminal, but an administrator may stop an issue without a repair. */
export function AdministrativeClosureNotice({ status, resolvedAt }: { status: IssueStatus; resolvedAt?: string | null }) {
  if (status !== "CLOSED" || resolvedAt) return null;
  return <p className="text-dense mt-2 mb-3 border border-rule rounded px-3 py-2 bg-surface-raised"><strong>Closed before resolution.</strong> An administrator ended this complaint. This is not a verified repair. The closure reason is recorded in its history.</p>;
}
