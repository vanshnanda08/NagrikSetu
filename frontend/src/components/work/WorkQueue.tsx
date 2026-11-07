"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ComplaintsShell } from "./ComplaintsShell";
import { WorkIssuePanel } from "./WorkIssuePanel";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { StatusRule } from "@/components/StatusRule";
import { PriorityBadge } from "@/components/PriorityBadge";
import { DeadlineCountdown } from "@/components/DeadlineCountdown";
import { useAuth } from "@/lib/auth";
import { ApiError, request } from "@/lib/api";
import { workHref } from "@/lib/navigation";
import { isOverdue } from "@/lib/status";
import type { QueueRow } from "@/lib/types";

const TABS = [
  { value: "mine", label: "Assigned to me" },
  { value: "unassigned", label: "Unassigned" },
  { value: "all", label: "All open" },
];
const PAGE = 50;

export function WorkQueue() {
  const params = useSearchParams();
  const { session, authed } = useAuth();
  const requestedTab = params.get("tab");
  const tab = TABS.some(item => item.value === requestedTab) ? requestedTab! : "mine";
  const selectedId = params.get("issue");
  const requestedOffset = Number(params.get("queueOffset"));
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 && requestedOffset <= 2_000_000_000 ? requestedOffset : 0;
  const listRef = useRef<HTMLDivElement>(null);
  const queue = useQuery({
    queryKey: ["staff", "queue", tab, session?.userId, offset],
    // One lookahead row tells us whether another page exists without inventing a total.
    queryFn: () => authed(token => request<QueueRow[]>(`/staff/queue?tab=${tab}&limit=${PAGE + 1}&offset=${offset}`, { token })),
    enabled: Boolean(session && session.role !== "CITIZEN"),
    staleTime: 30_000,
  });
  const rows = queue.data?.slice(0, PAGE);
  const hasNext = (queue.data?.length ?? 0) > PAGE;
  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (list && selected) list.scrollTop += selected.getBoundingClientRect().top - list.getBoundingClientRect().top;
  }, [selectedId, queue.data]);
  return <ComplaintsShell view="mine">
    <p className="page-description mt-1 text-dense">Your department’s work, ordered by priority and deadline. Select a complaint to work on it.</p>
    <div className={`work-master-detail${selectedId ? " has-selection" : ""}`}>
      <section className="work-queue" aria-label="Work queue">
        <div className="work-queue-heading"><h2 className="text-heading">My work</h2>{rows && <span className="text-meta text-ink-muted" aria-live="polite">{offset === 0 && !hasNext ? `${rows.length} complaints` : rows.length ? `${offset + 1}–${offset + rows.length}${hasNext ? " · more available" : ""}` : "No complaints on this page"}</span>}</div>
        <nav className="work-queue-tabs" aria-label="Queue filters">
          {TABS.map(item => <Link key={item.value} href={workHref(params.toString(), { view: "mine", tab: item.value, issue: null, queueOffset: null })} scroll={false} aria-current={tab === item.value ? "page" : undefined}>{item.label}</Link>)}
        </nav>
        {queue.isPending && <LoadingState label="Loading your queue" />}
        {queue.isError && <ErrorState action="Loading the queue" problem={(queue.error as ApiError)?.problem} onRetry={() => void queue.refetch()} />}
        {rows?.length === 0 && <EmptyState message={offset ? "No more complaints on this page. The queue may have changed." : tab === "mine" ? "Nothing assigned to you." : tab === "unassigned" ? "Everything open in your department is assigned." : "No open work in your department."}
          actionLabel={offset ? "Back to first page" : tab === "all" ? "Explore public issues" : "See all open work"} actionHref={offset ? workHref(params.toString(), { queueOffset: null, issue: null }) : tab === "all" ? "/issues" : "/work?view=mine&tab=all"} />}
        {rows && rows.length > 0 && <div ref={listRef} key={`${tab}:${offset}`} className="work-list" tabIndex={0} role="region" aria-label="Prioritized complaints">
          <ol className="list-none p-0 m-0">{rows.map(row => <li key={row.id}>
            <Link href={workHref(params.toString(), { view: "mine", issue: row.id })} scroll={false} className="work-queue-item" aria-current={selectedId === row.id ? "true" : undefined}>
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-ref font-semibold">{row.publicRef}</span><PriorityBadge priority={row.priority} score={row.priorityScore} /></div>
              <strong className="text-body">{row.categoryName}</strong>
              <StatusRule status={row.status} overdue={isOverdue(row.status, row.effectiveDeadline)} audience="staff" />
              <div className="text-meta text-ink-muted">{row.wardName}{row.landmark ? ` · ${row.landmark}` : ""}</div>
              <div className="flex flex-wrap items-center gap-2 text-meta"><span>{row.distinctReporterCount} reporter{row.distinctReporterCount === 1 ? "" : "s"}</span><DeadlineCountdown status={row.status} effectiveDeadline={row.effectiveDeadline} pausedSeconds={row.pausedSeconds} /></div>
            </Link>
          </li>)}</ol>
        </div>}
        {(hasNext || offset > 0) && <nav className="work-queue-pagination flex items-center justify-between gap-3 border-t border-rule pt-2" aria-label="Work queue pages">
          {offset > 0 ? <Link className="work-close underline" scroll={false} href={workHref(params.toString(), { queueOffset: offset > PAGE ? String(offset - PAGE) : null, issue: null })}>Previous</Link> : <span className="text-meta text-ink-muted" aria-disabled="true">Previous</span>}
          {hasNext ? <Link className="work-close underline" scroll={false} href={workHref(params.toString(), { queueOffset: String(offset + PAGE), issue: null })}>Next</Link> : <span className="text-meta text-ink-muted" aria-disabled="true">Next</span>}
        </nav>}
      </section>
      {selectedId ? <WorkIssuePanel issueId={selectedId} closeHref={workHref(params.toString(), { issue: null })} /> : <div className="work-empty-detail"><h2 className="text-heading">Select a complaint</h2><p className="text-dense text-ink-muted mt-2">Its status, deadline and permitted work actions will appear here.</p></div>}
    </div>
  </ComplaintsShell>;
}
