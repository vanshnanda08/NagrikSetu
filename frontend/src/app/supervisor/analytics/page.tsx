"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { ScopeOverview } from "@/components/ScopeOverview";
import { useAuth } from "@/lib/auth";
import { request, type ApiError } from "@/lib/api";
import { absoluteDateTime, durationHours, percent } from "@/lib/format";
import { useSignIn } from "@/lib/signInDialog";
import type { DepartmentAccountability, DepartmentAnalytics } from "@/lib/types";

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
    <PageShell wide>
      <div className="flex flex-wrap items-end gap-4">
        <h1 className="text-display">Department analytics</h1>
        {isAdmin && departments.data && (
          <label className="flex flex-col gap-1 text-meta ml-auto">
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
      </div>

      {analytics.isPending && analytics.fetchStatus !== "idle" && <LoadingState label="Loading the analytics" />}
      {analytics.isError && (
        <ErrorState
          action="Loading the analytics"
          problem={(analytics.error as ApiError)?.problem}
          onRetry={() => void analytics.refetch()}
        />
      )}

      {analytics.data && (
        <>
          <p className="mt-1 text-dense text-ink-muted" style={{ maxWidth: "var(--measure-prose)" }}>
            {analytics.data.department.name}. The public dashboard&apos;s figures for this department, and each
            crew member&apos;s record. <strong>Internal: never published.</strong> Generated{" "}
            {absoluteDateTime(analytics.data.generatedAt)}.
          </p>

          <div className="mt-5">
            <ScopeOverview m={analytics.data.metrics} />
          </div>

          <section className="mt-8">
            <h2 className="text-heading">Crew</h2>
            <p className="mt-1 text-dense text-ink-muted" style={{ maxWidth: "var(--measure-prose)" }}>
              A fix counts for whoever submitted it for verification, not whoever the issue was assigned to
              when it settled. A median needs {analytics.data.minimumSample} resolved fixes before it is shown.
            </p>
            {analytics.data.staff.length === 0 ? (
              <p className="mt-3 text-body">No crew members are on this department yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-dense border-collapse">
                  <caption className="sr-only">Crew record for {analytics.data.department.name}</caption>
                  <thead>
                    <tr className="text-left text-meta text-ink-muted border-b border-rule-strong">
                      <th scope="col" className="py-2 pr-4 font-normal">Crew member</th>
                      <th scope="col" className="py-2 pr-4 font-normal text-right">Fixes claimed</th>
                      <th scope="col" className="py-2 pr-4 font-normal text-right">Resolved</th>
                      <th scope="col" className="py-2 pr-4 font-normal text-right">Reopened</th>
                      <th scope="col" className="py-2 pr-4 font-normal text-right">Median time</th>
                      <th scope="col" className="py-2 pr-4 font-normal text-right">Open now</th>
                      <th scope="col" className="py-2 font-normal text-right">Overdue now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.data.staff.map((s) => (
                      <tr key={s.id} className="border-b border-rule">
                        <th scope="row" className="py-2 pr-4 text-left font-normal">{s.name}</th>
                        <td className="py-2 pr-4 text-right">{s.fixesClaimed}</td>
                        <td className="py-2 pr-4 text-right">{s.resolved}</td>
                        <td className="py-2 pr-4 text-right">
                          {s.fixesClaimed === 0 ? "–" : `${s.reopened} (${percent(s.reopenRate)})`}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {s.medianResolutionHours === null
                            ? s.resolved === 0
                              ? "–"
                              : `needs ${analytics.data.minimumSample}`
                            : durationHours(s.medianResolutionHours)}
                        </td>
                        <td className="py-2 pr-4 text-right">{s.openAssigned}</td>
                        <td className="py-2 text-right">{s.overdueAssigned}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </PageShell>
  );
}
