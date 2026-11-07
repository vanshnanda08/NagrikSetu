"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowUpRight, RefreshCw } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/Button";
import { MetricTile } from "@/components/MetricTile";
import { IssueRow } from "@/components/IssueRow";
import { StatusRule } from "@/components/StatusRule";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonTile } from "@/components/Skeleton";
import { LoadingState } from "@/components/LoadingState";
import { useAuth } from "@/lib/auth";
import { ApiError, request } from "@/lib/api";
import { absoluteDateTime, timeAgo } from "@/lib/format";
import { isOverdue } from "@/lib/status";
import { workHref } from "@/lib/navigation";
import type { StaffOverview as Overview } from "@/lib/types";

type View = "mine" | "department" | "workload";
const count = (value: number) => value.toLocaleString("en-IN");

/** Operational context for the signed-in crew member; scope is enforced by the API. */
export function StaffOverview() {
  const { session, authed } = useAuth();
  const [selection, setSelection] = useState<View | null>(null);
  const overview = useQuery({
    queryKey: ["staff", "overview", session?.userId],
    queryFn: () => authed(token => request<Overview>("/staff/overview", { token })),
    enabled: session?.role === "STAFF",
    refetchInterval: 60_000,
    retry: 1,
  });
  const data = overview.data;
  const view = selection ?? (data?.personal.open ? "mine" : "department");
  const rows = data ? (view === "mine" ? data.myPriorities : data.departmentPriorities) : [];
  const total = data ? (view === "mine" ? data.personal.open : data.departmentWork.open) : 0;
  const queueHref = workHref("", { view: "mine", tab: view === "mine" ? "mine" : "all" });

  return <PageShell wide className="dashboard-page staff-overview-page">
    <div className="dashboard-greeting staff-overview-heading">
      <div>
        <h1 className="text-display">Department overview</h1>
        <p className="text-dense text-ink-muted mt-1">{data ? `${data.department.name} · ${data.ward?.name ?? "All wards"}` : "Your department’s current workload and your next actions."}</p>
      </div>
      <Button variant="secondary" onClick={() => void overview.refetch()} disabled={overview.isFetching}>
        <RefreshCw size={16} aria-hidden="true" />{overview.isFetching ? "Refreshing…" : "Refresh"}
      </Button>
    </div>

    {overview.isError && <ErrorState action="Loading your department overview" problem={(overview.error as ApiError)?.problem} onRetry={() => void overview.refetch()} />}
    {overview.isPending && <div className="dashboard-layout">
      <section className="dashboard-metrics" aria-label="Loading department statistics">
        <span className="sr-only" aria-live="polite">Loading department statistics…</span>
        <div className="dashboard-metric-grid">{Array.from({ length: 8 }, (_, index) => <SkeletonTile key={index} />)}</div>
      </section>
      <section className="dashboard-detail surface-card"><LoadingState label="Loading work priorities" /></section>
    </div>}
    {data && <div className="dashboard-layout">
      <section className="dashboard-metrics" tabIndex={0} aria-label="Your work and department statistics">
        <div className="dashboard-metric-grid">
          <MetricTile label="Your open assignments" value={count(data.personal.open)} trend={`${count(data.personal.awaitingVerification)} awaiting citizen verification`} />
          <MetricTile label="Your overdue work" value={count(data.personal.overdue)} emphasis={data.personal.overdue > 0} trend="Running clocks past their deadline" />
          <MetricTile label="Ready to start" value={count(data.personal.readyToStart)} trend="Your assigned or reopened complaints" />
          <MetricTile label="In progress" value={count(data.personal.inProgress)} trend="Repairs you are working on" />
          <MetricTile label="Department open" value={count(data.departmentWork.open)} trend="All active complaints in your scope" />
          <MetricTile label="Department overdue" value={count(data.departmentWork.overdue)} trend="Excludes paused verification clocks" />
          <MetricTile label="Needs crew assignment" value={count(data.departmentWork.needsAssignment)} trend="New or acknowledged; supervisor assigns" />
          <MetricTile label="Awaiting verification" value={count(data.departmentWork.awaitingVerification)} trend="Department fixes awaiting citizen checks" />
        </div>
      </section>

      <section className="dashboard-detail surface-card" aria-labelledby="staff-priorities-heading">
        <div className="dashboard-detail-toolbar">
          <h2 id="staff-priorities-heading"><Activity size={20} aria-hidden="true" />Work priorities</h2>
          <div className="dashboard-view-picker">
            <label htmlFor="staff-overview-view" className="sr-only">Overview details</label>
            <select id="staff-overview-view" value={view} onChange={event => setSelection(event.target.value as View)} aria-controls="staff-overview-content">
              <option value="mine">My priorities</option>
              <option value="department">Department priorities</option>
              <option value="workload">Workload by status</option>
            </select>
          </div>
        </div>
        <div id="staff-overview-content" className="dashboard-detail-body" tabIndex={0} role="region" aria-label={view === "mine" ? "My priorities" : view === "department" ? "Department priorities" : "Workload by status"}>
          {view === "workload" ? <>
            <p className="text-dense text-ink-muted mb-3">Open complaints in your department{data.ward ? " and assigned ward" : ""}. Verification clocks are paused while citizens check a fix.</p>
            <table className="staff-workload-table">
              <caption className="sr-only">Open complaints by status, department total and assigned to you</caption>
              <thead><tr><th scope="col">Status</th><th scope="col">Department</th><th scope="col">Yours</th></tr></thead>
              <tbody>{data.stages.map(stage => <tr key={stage.status}>
                <th scope="row"><StatusRule status={stage.status} audience="staff" /></th>
                <td>{count(stage.total)}</td><td>{count(stage.mine)}</td>
              </tr>)}</tbody>
              <tfoot><tr><th scope="row">Total open</th><td>{count(data.departmentWork.open)}</td><td>{count(data.personal.open)}</td></tr></tfoot>
            </table>
            <p className="text-dense text-ink-muted mt-4">Open a complaint in the work queue to acknowledge it, record permitted progress or submit repair proof. Assignments and grouping reviews stay with your supervisor.</p>
          </> : <>
            <p className="text-meta text-ink-muted mb-2">{rows.length ? `Showing ${rows.length} of ${count(total)} open complaints, ordered by priority and deadline.` : "Ordered by priority and deadline."}</p>
            {rows.length === 0 && <EmptyState message={view === "mine" ? "Nothing assigned to you. Your department’s work is available under Department priorities." : "No open complaints in your department scope."} />}
            <ol className="list-none m-0 p-0">{rows.map(row => <li key={row.id}><IssueRow
              {...row} href={workHref("", { view: "mine", tab: view === "mine" ? "mine" : "all", issue: row.id })}
              overdue={isOverdue(row.status, row.effectiveDeadline)} ageLabel={timeAgo(row.firstReportedAt)} audience="staff"
            /></li>)}</ol>
          </>}
        </div>
        <div className="staff-overview-footer">
          <Link href={queueHref} className="text-dense underline inline-flex items-center gap-1">{view === "mine" ? "Open my work queue" : "Open department queue"}<ArrowUpRight size={16} aria-hidden="true" /></Link>
          <p className="text-meta text-ink-muted">Updated {absoluteDateTime(data.generatedAt)} · refreshes every minute</p>
        </div>
      </section>
    </div>}
  </PageShell>;
}
