"use client";

import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { ComplaintsShell } from "@/components/work/ComplaintsShell";

import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { ScopeOverview, ScopeCharts } from "@/components/ScopeOverview";
import { SectionTabs } from "@/components/SectionTabs";
import { Button } from "@/components/Button";
import { useAuth } from "@/lib/auth";
import { request, type ApiError } from "@/lib/api";
import { absoluteDateTime, durationHours, percent } from "@/lib/format";
import { useSignIn } from "@/lib/signInDialog";
import type { DepartmentAccountability, DepartmentAnalytics, StaffAnalyticsRow } from "@/lib/types";

const DETAIL_VIEWS = [
  { id: "crew", label: "Crew" }, { id: "trends", label: "Trends" }, { id: "backlog", label: "Backlog" },
];
const SHORT_DESKTOP = "(min-width: 1280px) and (min-height: 600px) and (max-height: 699px)";
function subscribeViewport(callback: () => void) {
  const media = window.matchMedia(SHORT_DESKTOP);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const shortDesktop = () => window.matchMedia(SHORT_DESKTOP).matches;

/**
 * Department analytics (blueprint 3.20): the public dashboard scoped to the
 * supervisor's own department, plus how each member of crew is doing.
 *
 * Internal only, on purpose. The project measures departments in public and
 * individuals in private: nothing on this screen is reachable without a
 * supervisor or administrator account, and the server takes the department
 * from the token, so there is no parameter a supervisor could use to look at
 * somebody else's crew.
 */
export default function AnalyticsPage() {
  const { session, initialising, authed } = useAuth();
  const { openSignIn } = useSignIn();
  const isAdmin = session?.role === "ADMIN";
  const isSupervisor = session?.role === "SUPERVISOR" || isAdmin;
  const [chosen, setChosen] = useState("");
  const [detail, setDetail] = useState("crew");
  const compactCharts = useSyncExternalStore(subscribeViewport, shortDesktop, () => false);

  const departments = useQuery({
    queryKey: ["dashboard", "departments"],
    queryFn: () => request<DepartmentAccountability[]>("/dashboard/departments"),
    enabled: isAdmin,
    staleTime: Infinity,
  });
  const departmentId = isAdmin ? chosen || departments.data?.[0]?.departmentId || "" : "";

  const analytics = useQuery({
    queryKey: ["supervisor", "analytics", session?.userId, departmentId],
    queryFn: () =>
      authed((token) =>
        request<DepartmentAnalytics>(
          `/supervisor/analytics${departmentId ? `?departmentId=${departmentId}` : ""}`,
          { token },
        ),
      ),
    enabled: Boolean(isSupervisor) && (!isAdmin || departmentId !== ""),
    staleTime: 60_000,
    refetchInterval: 60_000,
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
        <h1 className="text-display">Department analytics</h1>
        <EmptyState
          message={
            session
              ? "Department analytics are for supervisors and administrators."
              : "Sign in with a supervisor account to see your department's analytics."
          }
          {...(session ? {} : { actionLabel: "Sign in", onAction: openSignIn })}
        />
      </PageShell>
    );
  }

  return (
    <ComplaintsShell view="performance" className="performance-workspace">
      <div className="performance-heading">
        <div>
          <h2 className="text-heading">Team performance</h2>
          <p className="text-dense text-ink-muted">{analytics.data?.department.name ?? "Department overview"} · Internal, never published</p>
        </div>
        <div className="performance-controls">
        {isAdmin && departments.data && (
          <label className="flex flex-col gap-1 text-meta">
            Department
            <select
              value={departmentId}
              onChange={(e) => setChosen(e.target.value)}
              className="bg-surface-raised text-body text-ink border border-rule px-3"
              style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)" }}
            >
              {departments.data.map((d) => (
                <option key={d.departmentId} value={d.departmentId}>
                  {d.departmentName}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button variant="secondary" onClick={() => void analytics.refetch()} disabled={!analytics.isEnabled || analytics.isFetching}>
          <RefreshCw size={16} aria-hidden="true" />{analytics.isFetching ? "Refreshing…" : "Refresh"}
        </Button>
        </div>
      </div>

      {isAdmin && departments.isPending && <LoadingState label="Loading departments" />}
      {isAdmin && departments.isError && <ErrorState action="Loading departments" problem={(departments.error as ApiError)?.problem} onRetry={() => void departments.refetch()} />}
      {isAdmin && departments.data?.length === 0 && <EmptyState message="No departments are available. Configure a department in Administration first." actionLabel="Open administration" actionHref="/admin" />}
      {analytics.isPending && analytics.fetchStatus !== "idle" && <LoadingState label="Loading the analytics" />}
      {analytics.isError && (
        <ErrorState
          action="Loading the analytics"
          problem={(analytics.error as ApiError)?.problem}
          onRetry={() => void analytics.refetch()}
        />
      )}

      {analytics.data && (
        <div className="performance-layout">
          <section className="performance-metrics" tabIndex={0} aria-label="Department performance metrics">
            <ScopeOverview m={analytics.data.metrics} charts={false} compact />
          </section>
          <section className="performance-detail surface-card" aria-label="Performance details">
            <SectionTabs label="Performance detail views" prefix="performance" items={DETAIL_VIEWS} current={detail} onChange={setDetail} />
            {DETAIL_VIEWS.map(view => <div key={view.id} id={`performance-panel-${view.id}`} role="tabpanel" aria-labelledby={`performance-tab-${view.id}`} hidden={detail !== view.id} tabIndex={0} className="performance-detail-body">
              {detail === view.id && (view.id === "crew" ? <CrewPerformance data={analytics.data} /> : <ScopeCharts m={analytics.data.metrics} view={view.id === "trends" ? "trends" : "backlog"} height={compactCharts ? 160 : 220} />)}
            </div>)}
            <div className="performance-context">
              <p className="text-meta text-ink-muted">Updated {absoluteDateTime(analytics.data.generatedAt)} · refreshes every minute</p>
              <details>
                <summary className="text-meta">How to read these figures</summary>
                <div className="performance-definitions" tabIndex={0} role="region" aria-label="Performance metric definitions">
                <p className="text-meta text-ink-muted">Department totals use the public dashboard’s definitions. Resolution time runs from first report to resolution. SLA compliance counts fixes claimed before the deadline. Unverified resolutions count resolutions without a citizen confirming the fix. Open work includes fixes awaiting verification; their SLA clocks are paused.</p>
                <p className="text-meta text-ink-muted mt-2">A fix counts for whoever submitted it for verification, not whoever the issue was assigned to when it settled. A median needs {analytics.data.minimumSample} resolved fixes before it is shown.</p>
                </div>
              </details>
            </div>
          </section>
        </div>
      )}
    </ComplaintsShell>
  );
}

function medianTime(row: StaffAnalyticsRow, minimumSample: number) {
  return row.medianResolutionHours !== null ? durationHours(row.medianResolutionHours)
    : row.resolved === 0 ? "No resolved fixes" : `Needs ${minimumSample} resolved`;
}

function CrewPerformance({ data }: { data: DepartmentAnalytics }) {
  return <>
    <div className="performance-section-heading"><h3 className="text-heading">Crew performance</h3><span className="text-meta text-ink-muted">{data.staff.length} member{data.staff.length === 1 ? "" : "s"}</span></div>
    <p className="text-meta text-ink-muted mb-3">Fixes are credited to the person who submitted repair proof. Median time requires {data.minimumSample} resolved fixes.</p>
    {data.staff.length === 0 ? <EmptyState message="No crew members are on this department yet." /> : <>
      <div className="performance-table-wrap" tabIndex={0} role="region" aria-label="Staff performance table">
        <table className="performance-table">
          <caption className="sr-only">Crew record for {data.department.name}</caption>
          <thead><tr><th scope="col">Crew member</th><th scope="col">Fixes claimed</th><th scope="col">Resolved</th><th scope="col">Reopened</th><th scope="col">Median time</th><th scope="col">Open now</th><th scope="col">Overdue now</th></tr></thead>
          <tbody>{data.staff.map(row => <tr key={row.id}>
            <th scope="row">{row.name}</th><td>{row.fixesClaimed}</td><td>{row.resolved}</td>
            <td>{row.fixesClaimed === 0 ? <span aria-label="No claimed fixes">–</span> : `${row.reopened} (${percent(row.reopenRate)})`}</td>
            <td>{medianTime(row, data.minimumSample)}</td><td>{row.openAssigned}</td><td>{row.overdueAssigned}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <ul className="performance-crew-cards list-none m-0 p-0" aria-label="Crew performance records">{data.staff.map(row => <li key={row.id}>
        <h4 className="text-dense font-semibold">{row.name}</h4>
        <dl>{[
          ["Fixes claimed", row.fixesClaimed], ["Resolved", row.resolved],
          ["Reopened", row.fixesClaimed === 0 ? "No claimed fixes" : `${row.reopened} (${percent(row.reopenRate)})`],
          ["Median time", medianTime(row, data.minimumSample)], ["Open now", row.openAssigned], ["Overdue now", row.overdueAssigned],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </li>)}</ul>
    </>}
  </>;
}
