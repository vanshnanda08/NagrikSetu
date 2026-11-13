"use client";

import { MetricTile } from "./MetricTile";
import { TrendChart } from "./charts/TrendChart";
import { ColumnChart } from "./charts/ColumnChart";
import { durationHours, percent } from "@/lib/format";
import type { ScopeMetrics } from "@/lib/types";

function needs(m: ScopeMetrics, have: number, what: string, compact = false): string {
  const more = Math.max(1, m.minimumSample - have);
  if (compact) return `Needs ${more} more resolved (${have}/${m.minimumSample}).`;
  return `Needs ${more} more resolved issue${more === 1 ? "" : "s"} before ${what} means anything (${have} so far).`;
}

/**
 * The dashboard's figures for one ward or one department: eight tiles and two
 * charts, with the same definitions and the same "needs N more" empty state as
 * the city dashboard. Shared by the ward page (public) and department
 * analytics (internal), so the two cannot drift into measuring different things.
 */
export function ScopeOverview({ m, charts = true, compact = false }: { m: ScopeMetrics; charts?: boolean; compact?: boolean }) {
  const median = m.medianResolutionHours === null ? null : durationHours(m.medianResolutionHours).split(" ");
  const sla = percent(m.slaRate);
  const reopen = percent(m.reopenRate);
  const unverified = percent(m.unverifiedRate);

  return (
    <>
      <div className="scope-metric-grid grid grid-cols-2 lg:grid-cols-4 gap-3 u-stagger">
        <MetricTile
          label={compact ? "Overdue complaints" : "Currently overdue"}
          emphasis={m.overdueCount > 0}
          {...(m.overdueCount > 0
            ? { value: m.overdueCount.toLocaleString("en-IN"), trend: compact ? "Past the running deadline" : "Breached and still on the clock" }
            : { value: "0", trend: "Nothing is overdue" })}
        />
        <MetricTile label={compact ? "Open complaints" : "Open issues"} value={m.openCount.toLocaleString("en-IN")} trend={compact ? "Active department workload" : undefined} />
        <MetricTile
          label="Resolved to date"
          value={m.resolvedCount.toLocaleString("en-IN")}
          trend={`${m.resolvedLast30Days.toLocaleString("en-IN")} in the last 30 days`}
        />
        <MetricTile label={compact ? "Reported in 30 days" : "Reported, last 30 days"} value={m.reportedLast30Days.toLocaleString("en-IN")} trend={compact ? "New department complaints" : undefined} />
        <MetricTile
          label={compact ? "Median resolution" : "Median resolution time"}
          {...(median
            ? {
                value: median[0],
                unit: median[1],
                trend: compact ? `${m.resolvedWithTime.toLocaleString("en-IN")} resolved complaints` : `Across ${m.resolvedWithTime.toLocaleString("en-IN")} resolved issues, first report to resolution`,
              }
            : { pending: needs(m, m.resolvedWithTime, "a median", compact) })}
        />
        <MetricTile
          label="SLA compliance"
          {...(sla
            ? {
                value: sla,
                trend: compact ? `${m.slaOnTime.toLocaleString("en-IN")} of ${m.slaResolved.toLocaleString("en-IN")} claimed on time` : `${m.slaOnTime.toLocaleString("en-IN")} of ${m.slaResolved.toLocaleString("en-IN")} fixes claimed before the deadline`,
              }
            : { pending: needs(m, m.slaResolved, "a compliance rate", compact) })}
        />
        <MetricTile
          label="Reopen rate"
          {...(reopen
            ? { value: reopen, trend: `${m.reopened} of ${m.fixesClaimed} claimed fixes were reopened` }
            : { pending: "No fix has been claimed here yet." })}
        />
        <MetricTile
          label={compact ? "Unverified resolutions" : "Resolved without citizen verification"}
          {...(unverified
            ? {
                value: unverified,
                trend: compact ? `${m.resolvedWithoutVerification} of ${m.resolvedCount} · no citizen confirmation` : `${m.resolvedWithoutVerification} of ${m.resolvedCount} resolved issues`,
              }
            : { pending: "Nothing has been resolved here yet." })}
        />
      </div>

      {!!m.closedWithoutResolution && <p className="text-meta text-ink-muted mt-2">{m.closedWithoutResolution.toLocaleString("en-IN")} closed before resolution by an administrator; excluded from resolution and SLA figures.</p>}
      {charts && <ScopeCharts m={m} />}
    </>
  );
}

/** Same chart definitions for wards and private department views. */
export function ScopeCharts({ m, view, height }: { m: ScopeMetrics; view?: "trends" | "backlog"; height?: number }) {
  return <div className={`scope-charts${view ? "" : " mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6"}`}>
    {view !== "backlog" && <section>
      <h2 className="text-heading">New vs resolved complaints, last 90 days</h2>
      <div className="mt-3">
        <TrendChart
          height={height}
          title="New and resolved complaints per day, last 90 days"
          series={[
            { key: "reported", label: "New complaints", color: "var(--chart-context)", lineStyle: "dashed" },
            { key: "resolved", label: "Resolved", color: "var(--st-resolved)", lineStyle: "solid" },
          ]}
          rows={m.reportedVsResolved}
        />
      </div>
    </section>}
    {view !== "trends" && <section>
      <h2 className="text-heading">Open backlog by age</h2>
      <div className="mt-3">
        <ColumnChart
          height={height}
          title="Open issues by time since first report"
          valueLabel="Open issues"
          labelCaps
          columns={m.backlogAge.map((b) => ({
            key: b.label,
            label: b.label,
            axisLabel:
              b.toDays === null
                ? `${b.fromDays}d+`
                : b.toDays <= 7
                  ? `${b.fromDays}–${b.toDays}d`
                  : `${b.fromDays / 7}–${b.toDays === 30 ? "4" : b.toDays / 7}w`,
            values: [b.open],
          }))}
        />
      </div>
    </section>}
  </div>;
}
