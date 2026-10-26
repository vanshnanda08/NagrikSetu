"use client";

import { MetricTile } from "./MetricTile";
import { TrendChart } from "./charts/TrendChart";
import { ColumnChart } from "./charts/ColumnChart";
import { durationHours, percent } from "@/lib/format";
import type { ScopeMetrics } from "@/lib/types";

function needs(m: ScopeMetrics, have: number, what: string): string {
  const more = Math.max(1, m.minimumSample - have);
  return `Needs ${more} more resolved issue${more === 1 ? "" : "s"} before ${what} means anything (${have} so far).`;
}

/**
 * The dashboard's figures for one ward or one department: eight tiles and two
 * charts, with the same definitions and the same "needs N more" empty state as
 * the city dashboard. Shared by the ward page (public) and department
 * analytics (internal), so the two cannot drift into measuring different things.
 */
export function ScopeOverview({ m, charts = true }: { m: ScopeMetrics; charts?: boolean }) {
  const median = m.medianResolutionHours === null ? null : durationHours(m.medianResolutionHours).split(" ");
  const sla = percent(m.slaRate);
  const reopen = percent(m.reopenRate);
  const unverified = percent(m.unverifiedRate);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 u-stagger">
        <MetricTile
          label="Currently overdue"
          emphasis={m.overdueCount > 0}
          {...(m.overdueCount > 0
            ? { value: m.overdueCount.toLocaleString("en-IN"), trend: "Breached and still on the clock" }
            : { value: "0", trend: "Nothing is overdue" })}
        />
        <MetricTile label="Open issues" value={m.openCount.toLocaleString("en-IN")} />
        <MetricTile
          label="Resolved to date"
          value={m.resolvedCount.toLocaleString("en-IN")}
          trend={`${m.resolvedLast30Days.toLocaleString("en-IN")} in the last 30 days`}
        />
        <MetricTile label="Reported, last 30 days" value={m.reportedLast30Days.toLocaleString("en-IN")} />
        <MetricTile
          label="Median resolution time"
          {...(median
            ? {
                value: median[0],
                unit: median[1],
                trend: `Across ${m.resolvedWithTime.toLocaleString("en-IN")} resolved issues, first report to resolution`,
              }
            : { pending: needs(m, m.resolvedWithTime, "a median") })}
        />
        <MetricTile
          label="SLA compliance"
          {...(sla
            ? {
                value: sla,
                trend: `${m.slaOnTime.toLocaleString("en-IN")} of ${m.slaResolved.toLocaleString("en-IN")} fixes claimed before the deadline`,
              }
            : { pending: needs(m, m.slaResolved, "a compliance rate") })}
        />
        <MetricTile
          label="Reopen rate"
          {...(reopen
            ? { value: reopen, trend: `${m.reopened} of ${m.fixesClaimed} claimed fixes were reopened` }
            : { pending: "No fix has been claimed here yet." })}
        />
        <MetricTile
          label="Resolved without citizen verification"
          {...(unverified
            ? {
                value: unverified,
                trend: `${m.resolvedWithoutVerification} of ${m.resolvedCount} resolved issues`,
              }
            : { pending: "Nothing has been resolved here yet." })}
        />
      </div>

      {charts && (
        <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
          <section>
            <h2 className="text-heading">Reported against resolved, last 90 days</h2>
            <div className="mt-3">
              <TrendChart
                title="New issues and resolved issues per day, last 90 days"
                series={[
                  { key: "reported", label: "New issues", color: "var(--chart-context)" },
                  { key: "resolved", label: "Resolved", color: "var(--st-resolved)" },
                ]}
                rows={m.reportedVsResolved}
              />
            </div>
          </section>
          <section>
            <h2 className="text-heading">Open backlog by age</h2>
            <div className="mt-3">
              <ColumnChart
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
          </section>
        </div>
      )}
    </>
  );
}
