"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { ComplaintsShell } from "@/components/work/ComplaintsShell";

import { Button } from "@/components/Button";
import { DeadlineCountdown } from "@/components/DeadlineCountdown";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PriorityBadge } from "@/components/PriorityBadge";
import { StatusRule } from "@/components/StatusRule";
import { useAuth } from "@/lib/auth";
import { ApiError, request } from "@/lib/api";
import { invalidateAfterModeration } from "@/lib/moderation";
import { isOverdue } from "@/lib/status";
import { WorkIssuePanel } from "@/components/work/WorkIssuePanel";
import { ticketDetailsHref, workHref } from "@/lib/navigation";
import { useSignIn } from "@/lib/signInDialog";
import type { BoardRow } from "@/lib/types";

/**
 * Assignment board (blueprint 3.16): the staff queue plus assignment.
 *
 * Selecting acknowledged work opens the shared detail pane and its department picker --
 * only the people the ASSIGNEE_IN_SAME_DEPARTMENT guard would accept, each
 * with how much they already hold. New rows can be ticked and acknowledged in
 * bulk.
 *
 * Every change goes through the existing transition endpoints (/acknowledge,
 * /assign), one issue per request. A bulk acknowledge is therefore N
 * transitions, not one: a refusal on one issue is reported against that row
 * with the server's reason, and does not undo the others.
 *
 * Reporter names appear here and nowhere below this role (3.16). The staff
 * queue a crew member sees has no identity on it, by construction: these come
 * from a supervisor-only endpoint, not from extra fields on the shared row.
 */
const PAGE = 50;
const TABS = [
  // NEW and ACKNOWLEDGED, by status. Not "nobody holds it": escalation hands
  // assigned_to up the ladder, so escalated work has a holder and still needs
  // a crew (QueueTab.TO_ASSIGN).
  { value: "to_assign", label: "To assign" },
  { value: "all", label: "All open" },
];

export function AssignmentBoardPage() {
  return (
    <Suspense fallback={<PageShell wide><LoadingState label="Loading" /></PageShell>}>
      <BoardPage />
    </Suspense>
  );
}

/** Page changes also reset bulk selection when navigating with browser history. */
function BoardPage() {
  const params = useSearchParams();
  return <Board key={`${params.get("tab")}:${params.get("boardOffset")}`} />;
}

function Board() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedIssue = params.get("issue");
  const requestedTab = params.get("tab");

  const requestedOffset = Number(params.get("boardOffset"));
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;
  const { session, initialising, authed } = useAuth();
  const { openSignIn } = useSignIn();
  const qc = useQueryClient();
  const isSupervisor = session?.role === "SUPERVISOR" || session?.role === "ADMIN";
  const tab = requestedTab === "ready_to_close" && session?.role === "ADMIN" ? "ready_to_close" : requestedTab === "all" ? "all" : "to_assign";
  const tabs = session?.role === "ADMIN" ? [...TABS, { value: "ready_to_close", label: "Ready to close" }] : TABS;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<string | null>(null);

  const board = useQuery({
    queryKey: ["supervisor", "board", tab, session?.userId, offset],
    queryFn: () => authed((token) => request<BoardRow[]>(`/supervisor/queue?tab=${tab}&limit=${PAGE + 1}&offset=${offset}`, { token })),
    enabled: Boolean(isSupervisor),
    staleTime: 30_000,
  });

  // One transition per issue, in sequence: each succeeds or fails on its own.
  const bulkAck = useMutation({
    mutationFn: async (ids: string[]) => {
      const failures: Record<string, string> = {};
      let done = 0;
      for (const id of ids) {
        try {
          await authed((token) => request(`/issues/${id}/acknowledge`, { method: "POST", token, body: {} }));
          done++;
        } catch (e) {
          failures[id] = (e instanceof ApiError && e.problem?.detail) || "This one could not be acknowledged.";
        }
      }
      return { done, failures };
    },
    onSuccess: ({ done, failures }) => {
      setRowErrors(failures);
      setSelected(new Set(Object.keys(failures)));
      const failed = Object.keys(failures).length;
      setSummary(`${done} acknowledged${failed ? `, ${failed} refused — the reason is on each row` : ""}.`);
      invalidateAfterModeration(qc);
    },
  });

  if (initialising) {
    return (
      <PageShell>
        <LoadingState label="Checking your session" />
      </PageShell>
    );
  }
  if (!session || !isSupervisor) {
    return (
      <PageShell>
        <h1 className="text-display">Assignment board</h1>
        <EmptyState
          message={session ? "The assignment board is for supervisors and administrators." : "Sign in with a supervisor account to assign work."}
          {...(session ? {} : { actionLabel: "Sign in", onAction: openSignIn })}
        />
      </PageShell>
    );
  }

  const rows = board.data?.slice(0, PAGE) ?? [];
  const hasNext = (board.data?.length ?? 0) > PAGE;
  const goToPage = (next: number) => {
    setSelected(new Set());
    setRowErrors({});
    setSummary(null);
    router.push(workHref(params.toString(), { boardOffset: next ? String(next) : null, issue: null }), { scroll: false });
  };
  const acknowledgeable = rows.filter((b) => b.row.status === "NEW");
  // A concurrent officer may acknowledge a selected row while this batch runs.
  // Count and retry only records that are still NEW in the refreshed board.
  const selectedNewIds = acknowledgeable.filter((b) => selected.has(b.row.id)).map((b) => b.row.id);
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ComplaintsShell view="assignments">
      <h2 className="text-heading">Assignment board</h2>
      <p className="mt-1 text-dense text-ink-muted">{tab === "ready_to_close" ? "Resolved complaints awaiting closure. Review the repair and verification outcome before closing." : "Most urgent first. Acknowledge new work, then assign it to a crew member."}</p>

      <div className="segmented-control mt-4 flex flex-wrap gap-1 border-b border-rule">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            disabled={bulkAck.isPending}
            onClick={() => {
              setSelected(new Set());
              setRowErrors({});
              setSummary(null);
              router.push(workHref(params.toString(), { view: "assignments", tab: t.value, issue: null, boardOffset: null }), { scroll: false });
            }}
            className="px-3 py-2 bg-transparent border-0 cursor-pointer text-dense text-ink"
            style={{
              fontWeight: tab === t.value ? 600 : 400,
              borderBottom: tab === t.value ? "3px solid var(--ink)" : "3px solid transparent",
              marginBottom: -1,
            }}
            aria-current={tab === t.value ? "page" : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {board.isPending && <LoadingState label="Loading the board" />}
      {board.isError && (
        <ErrorState action="Loading the board" problem={(board.error as ApiError)?.problem} onRetry={() => void board.refetch()} />
      )}

      {board.data && rows.length === 0 && (
        offset > 0 ? (
          <EmptyState message="No complaints on this page." actionLabel="Back to first page" actionHref={workHref(params.toString(), { boardOffset: null, issue: null })} />
        ) : tab === "to_assign" ? (
          <EmptyState message="Nothing is waiting to be acknowledged or assigned." actionLabel="See all open work" actionHref="/work?view=assignments&tab=all" />
        ) : (
          <EmptyState message={tab === "ready_to_close" ? "No resolved complaints are waiting to be closed." : "No open work in your scope."} />
        )
      )}

      {rows.length === 0 && selectedIssue && <div className="work-master-detail detail-only has-selection"><WorkIssuePanel issueId={selectedIssue} closeHref={workHref(params.toString(), { issue: null })} /></div>}

      {rows.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-meta text-ink-muted">
              {offset === 0 && !hasNext ? `${rows.length} issues` : `${offset + 1}–${offset + rows.length}${hasNext ? " · more available" : ""}`}
              {acknowledgeable.length > 0 && ` · ${acknowledgeable.length} new`}
            </span>
            {acknowledgeable.length > 0 && (
              <>
                <button
                  type="button"
                  className="text-meta underline bg-transparent border-0 p-0 cursor-pointer text-ink"
                  onClick={() => setSelected(new Set(acknowledgeable.map((b) => b.row.id)))}
                >
                  Select new on this page
                </button>
                <Button
                  variant="secondary"
                  disabled={selectedNewIds.length === 0 || bulkAck.isPending}
                  onClick={() => bulkAck.mutate(selectedNewIds)}
                >
                  {bulkAck.isPending
                    ? "Acknowledging…"
                    : selectedNewIds.length > 0
                      ? `Acknowledge ${selectedNewIds.length} selected`
                      : "Acknowledge selected"}
                </Button>
              </>
            )}
          </div>
          {summary && (
            <p role="status" className="mt-2 text-dense">
              {summary}
            </p>
          )}

          <div className={`work-master-detail${selectedIssue ? " has-selection" : ""}`}>
          <div className="work-queue" role="region" aria-label="Assignment queue">
          <ol key={tab} className="work-list list-none p-0 border-t border-rule" tabIndex={0}>
            {rows.map((b) => (
              <Row
                key={b.row.id}
                b={b}
                selectable={b.row.status === "NEW"}
                selected={selected.has(b.row.id)}
                onToggle={() => toggle(b.row.id)}
                error={rowErrors[b.row.id]}
              />
            ))}
          </ol>
          </div>
          {selectedIssue ? <WorkIssuePanel issueId={selectedIssue} closeHref={workHref(params.toString(), { issue: null })} /> : <div className="work-empty-detail"><h2 className="text-heading">Complaint details</h2><p className="text-dense text-ink-muted mt-2">Select a ticket to view its work actions. Assignment and work controls appear beside the selected complaint.</p></div>}
          </div>
        </>
      )}
      {board.data && (hasNext || offset > 0) && (
        <nav className="work-queue-pagination flex items-center justify-between gap-3 border-t border-rule pt-2" aria-label="Assignment queue pages">
          <Button variant="secondary" disabled={offset === 0 || bulkAck.isPending || board.isFetching} onClick={() => goToPage(Math.max(0, offset - PAGE))}>Previous</Button>
          <Button variant="secondary" disabled={!hasNext || bulkAck.isPending || board.isFetching} onClick={() => goToPage(offset + PAGE)}>Next</Button>
        </nav>
      )}
    </ComplaintsShell>
  );
}

/**
 * Who holds the issue, in the right words. Before a crew is assigned, a holder
 * can only have come from escalation -- the SLA ladder hands assigned_to up to
 * a department head, ward officer or the commissioner -- and calling that
 * "assigned" would hide that nobody has been given the work.
 */
function holder(b: BoardRow): string {
  if (!b.assigneeName) return "unassigned";
  const preAssignment = b.row.status === "NEW" || b.row.status === "ACKNOWLEDGED";
  return preAssignment
    ? `escalated to ${b.assigneeName} (level ${b.row.escalationLevel}), no crew assigned`
    : `assigned to ${b.assigneeName}`;
}

function reporterLine(b: BoardRow): string {
  const names = b.reporters.map((r) => r.fullName);
  if (b.anonymousReporters > 0) {
    names.push(`${b.anonymousReporters} anonymous`);
  }
  return names.length ? names.join(", ") : "No reporters on record";
}

function Row({
  b,
  selectable,
  selected,
  onToggle,
  error,
}: {
  b: BoardRow;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  error?: string;
}) {
  const params = useSearchParams();
  const r = b.row;
  const overdue = isOverdue(r.status, r.effectiveDeadline);

  return (
    <li className="border-b border-rule py-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="pt-1" style={{ width: 24 }}>
          {selectable && (
            <input
              type="checkbox"
              className="w-5 h-5"
              checked={selected}
              onChange={onToggle}
              aria-label={`Select ${r.publicRef} to acknowledge`}
            />
          )}
        </div>
        <div className="flex-1 min-w-[18rem]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <StatusRule status={r.status} overdue={overdue} audience="staff" />
            <Link href={ticketDetailsHref(r.id, params.toString())} className="text-ref font-mono text-ink underline">
              {r.publicRef}
            </Link>
            <PriorityBadge priority={r.priority} score={r.priorityScore} />
            <DeadlineCountdown
              status={r.status}
              effectiveDeadline={r.effectiveDeadline}
              pausedSeconds={r.pausedSeconds}
              resolvedAt={null}
            />
          </div>
          <p className="mt-1 text-body">
            {r.categoryName} · {r.wardName}
            {r.landmark ? ` · ${r.landmark}` : ""}
          </p>
          <p className="mt-1 text-meta text-ink-muted">
            Reported by {reporterLine(b)}
            {" · "}
            {holder(b)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href={ticketDetailsHref(r.id, params.toString())} className="work-context-link">View ticket details</Link>
            <Link href={workHref(params.toString(), { view: "assignments", issue: r.id })} scroll={false} className="work-context-link" aria-current={params.get("issue") === r.id ? "true" : undefined}>Open work actions</Link>
          </div>
          {error && (
            <p className="mt-1 text-dense" style={{ color: "var(--st-breached)" }} role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

