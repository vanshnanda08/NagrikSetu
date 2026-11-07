"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { StaffOverview } from "@/components/work/StaffOverview";
import { LoadingState } from "@/components/LoadingState";
import { ComplaintTracker } from "@/components/ComplaintTracker";
import { MetricTile } from "@/components/MetricTile";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonTile, SkeletonTileGrid } from "@/components/Skeleton";
import { StatusRule } from "@/components/StatusRule";
import { TicketRef } from "@/components/TicketRef";
import { TrendChart } from "@/components/charts/TrendChart";
import {
  useBreaching,
  useDashboardMetrics,
  useDashboardStream,
  useDashboardSummary,
  useDepartmentAccountability,
  useWards,
} from "@/lib/queries";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { absoluteDateTime, humaniseMs, reporters } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import type { ApiError } from "@/lib/api";
import type { DashboardMetrics, DepartmentAccountability } from "@/lib/types";

const DETAIL_VIEWS = [
  "Complaint trends",
  "Overdue complaints",
  "Most reported complaints",
  "Ward overview",
] as const;
type DetailView = typeof DETAIL_VIEWS[number];

/**
 * Complaint dashboard (blueprint §3.8), complete as of phase 7.
 *
 * Three requests, each failing on its own: the summary row, the aggregates
 * (/dashboard/metrics, every section of which is itself nullable), and the
 * per-department verification record. A failing median cannot blank the
 * overdue count.
 *
 * LIVE. The overdue tile and the breaching list subscribe to the event stream
 * and refetch when the server says they changed; everything else refetches
 * every 60 seconds (§3.8).
 *
 * EMPTY. Below the minimum sample a figure is withheld and its tile says how
 * many more resolved issues it needs (§3.8: "Not zeros, not dashes"). A median
 * of three issues is an anecdote with a decimal point.
 *
 * COLOUR. The charts use two status colours and two neutrals, and nothing
 * else: resolved is --st-resolved because it IS that status; new issues and
 * late fixes are the validated context gray; single-series columns are the
 * neutral mark. The pairs were checked with the dataviz validator, which is
 * also why "late" is not red: red against green measured ΔE 1.9 under
 * deuteranopia -- one colour to roughly one man in twelve.
 */
export default function DashboardPage() {
  const { session, initialising } = useAuth();
  if (initialising) return <PageShell wide className="dashboard-page"><LoadingState label="Loading your overview" /></PageShell>;
  return session?.role === "STAFF" ? <StaffOverview /> : <CityDashboard />;
}

function CityDashboard() {
  const { session, initialising } = useAuth();
  const summary = useDashboardSummary();
  const metrics = useDashboardMetrics();
  const [detailView, setDetailView] = useState<DetailView>(DETAIL_VIEWS[0]);
  const needsMetrics = detailView !== "Overdue complaints" && detailView !== "Ward overview";
  useDashboardStream();

  return (
    <PageShell wide className="dashboard-page">
      <div className="dashboard-greeting">
        <div>
          <h1 className="text-display">Complaint Dashboard</h1>
        </div>
      </div>

      {!initialising && !session && <ComplaintTracker />}

      <div className="dashboard-layout">
        <section className="dashboard-metrics" tabIndex={0} aria-label="City metrics">
          <div className="dashboard-metric-grid u-stagger">
            {summary.isPending && <MetricPlaceholders count={4} label="Loading summary statistics" />}
            {summary.isError && (
              <ErrorState action="Loading the dashboard" problem={(summary.error as ApiError)?.problem} onRetry={() => void summary.refetch()} />
            )}
            {summary.data && <>
              <MetricTile label="Currently overdue" emphasis={summary.data.overdueCount !== null && summary.data.overdueCount > 0}
                {...(summary.data.overdueCount === null
                  ? { pending: FAILED }
                  : { value: summary.data.overdueCount.toLocaleString("en-IN"), trend: "Breached and still on the clock" })} />
              <MetricTile label="Resolved to date" value={summary.data.totalResolved.toLocaleString("en-IN")} trend="All resolved issues, city-wide" />
              <MetricTile label="Most overdue ward"
                {...(summary.data.topOverdueWard
                  ? { value: String(summary.data.topOverdueWard.count), trend: summary.data.topOverdueWard.name }
                  : { pending: "Nothing overdue in any ward." })} />
              <MetricTile label="Most overdue department"
                {...(summary.data.topOverdueDepartment
                  ? { value: String(summary.data.topOverdueDepartment.count), trend: summary.data.topOverdueDepartment.name }
                  : { pending: "No department has overdue work." })} />
            </>}
            {metrics.isPending && <MetricPlaceholders count={2} label="Loading resolution statistics" />}
            {metrics.isError && (
              <ErrorState action="Loading the dashboard figures" problem={(metrics.error as ApiError)?.problem} onRetry={() => void metrics.refetch()} />
            )}
            {metrics.data && <HeadlineAggregates m={metrics.data} />}
            <DepartmentRecord />
            {!!summary.data?.closedWithoutResolution && <p className="text-meta text-ink-muted col-span-full">{summary.data.closedWithoutResolution.toLocaleString("en-IN")} closed before resolution by an administrator; excluded from resolution and SLA figures.</p>}
          </div>
        </section>

        <section className="dashboard-detail surface-card" aria-labelledby="dashboard-detail-heading">
          <div className="dashboard-detail-toolbar">
            <h2 id="dashboard-detail-heading"><Activity size={20} aria-hidden="true" />City overview</h2>
            <div className="dashboard-view-picker">
              <label htmlFor="dashboard-detail-view" className="sr-only">Detail view</label>
              <select id="dashboard-detail-view" value={detailView} onChange={(event) => setDetailView(event.target.value as DetailView)} aria-controls="dashboard-detail-content">
                {DETAIL_VIEWS.map((view) => <option key={view} value={view}>{view}</option>)}
              </select>
            </div>
          </div>
          <div id="dashboard-detail-content" key={detailView} className="dashboard-detail-body" tabIndex={0} role="region" aria-label={detailView}>
            <DashboardSection title="Overdue complaints" selected={detailView}>
              <Breaching />
            </DashboardSection>

            {needsMetrics && metrics.isPending && <SkeletonTileGrid tiles={2} label="Loading the figures" />}
            {needsMetrics && metrics.isError && (
              <ErrorState
                action="Loading the dashboard figures"
                problem={(metrics.error as ApiError)?.problem}
                onRetry={() => void metrics.refetch()}
              />
            )}
            {metrics.data && <Aggregates m={metrics.data} selected={detailView} />}

            <DashboardSection title="Ward overview" selected={detailView}>
              <WardPages />
            </DashboardSection>

          </div>

          {metrics.data && (
            <details className="dashboard-notes text-meta text-ink-muted">
              <summary>About these figures</summary>
              <p>
                Figures generated {absoluteDateTime(metrics.data.generatedAt)}. Days are calendar days in
                local time. Resolution time runs from the first report to resolution; a fix counts as on time
                when the department claimed it before the deadline.
              </p>
            </details>
          )}
        </section>
      </div>
    </PageShell>
  );
}

/** One link per ward: each ward has its own public page (blueprint 3.9). */
function WardPages() {
  const wards = useWards();
  if (wards.isPending) return <p className="text-dense text-ink-muted">Loading the wards…</p>;
  if (wards.isError || !wards.data) {
    return <ErrorState action="Loading wards" problem={(wards.error as ApiError)?.problem} onRetry={() => void wards.refetch()} />;
  }
  return (
    <>
      <p className="mt-1 text-dense text-ink-muted" style={{ maxWidth: "var(--measure-prose)" }}>
        The same figures for one ward, its boundary with issue density, and the places that keep coming back.
      </p>
      <ul className="mt-3 list-none p-0 grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        {wards.data.map((w) => (
          <li key={w.id} className="border-b border-rule">
            <Link href={`/dashboard/wards/${w.id}`} className="block py-2 text-body underline text-ink">
              {w.name}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Only the selected view mounts, so charts measure the visible content area. */
function DashboardSection({ title, selected, children }: { title: DetailView; selected: DetailView; children: ReactNode }) {
  if (selected !== title) return null;
  return (
    <section className="dashboard-view" aria-label={title}>
      {children}
    </section>
  );
}

function MetricPlaceholders({ count, label }: { count: number; label: string }) {
  return <>
    <span className="sr-only" aria-live="polite">{label}…</span>
    {Array.from({ length: count }, (_, index) => <SkeletonTile key={index} />)}
  </>;
}

/**
 * The live list of breaching issues, most overdue first. The first eight are
 * shown: on a bad day all twenty push every chart off the first screens, and
 * the rest are one tap away rather than gone.
 */
const BREACHING_SHOWN = 8;

function Breaching() {
  const breaching = useBreaching();
  const [all, setAll] = useState(false);

  return (
    <div>
      {breaching.isPending && <SkeletonTileGrid tiles={1} label="Loading the breaching list" />}
      {breaching.isError && (
        <ErrorState
          action="Loading the breaching list"
          problem={(breaching.error as ApiError)?.problem}
          onRetry={() => void breaching.refetch()}
        />
      )}
      {breaching.data && breaching.data.length === 0 && (
        <p className="mt-2 text-body">Nothing is past its deadline right now.</p>
      )}
      {breaching.data && breaching.data.length > 0 && (
        <ol className="mt-3 list-none p-0 border-t border-rule">
          {(all ? breaching.data : breaching.data.slice(0, BREACHING_SHOWN)).map((b) => (
            <li key={b.id} className="border-b border-rule py-3 flex flex-wrap items-center gap-x-5 gap-y-1">
              <TicketRef publicRef={b.publicRef} issueId={b.id} />
              <StatusRule status={b.status} overdue />
              <span className="text-dense">
                <Link href={`/issues/${b.id}`} className="text-ink underline">
                  {b.categoryName}
                </Link>{" "}
                <span className="text-ink-muted">
                  · {b.wardName}
                  {b.departmentName ? ` · ${b.departmentName}` : ""} · {reporters(b.distinctReporterCount)}
                </span>
              </span>
              <span className="ml-auto text-dense font-semibold" style={{ color: "var(--st-breached)" }}>
                {humaniseMs(b.overdueSeconds * 1000)} overdue
                {b.escalationLevel > 0 && (
                  <span className="text-meta text-ink-muted font-normal"> · escalated to level {b.escalationLevel}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      {breaching.data && breaching.data.length > BREACHING_SHOWN && (
        <button
          type="button"
          className="mt-2 text-dense underline bg-transparent border-0 p-0 cursor-pointer text-ink"
          aria-expanded={all}
          onClick={() => setAll((a) => !a)}
        >
          {all ? "Show the most overdue only" : `Show all ${breaching.data.length} breaching issues`}
        </button>
      )}
    </div>
  );
}

/** Hours as the coarse unit a reader acts on. */
function duration(hours: number): string {
  return hours >= 48 ? `${(hours / 24).toFixed(1)} days` : `${hours.toFixed(1)} hours`;
}

function needs(m: DashboardMetrics, have: number): string {
  const more = Math.max(1, m.minimumSample - have);
  return `Needs ${more} more resolved issue${more === 1 ? "" : "s"} (${have} so far).`;
}

const FAILED = "Unavailable · retrying on the next refresh.";

function HeadlineAggregates({ m }: { m: DashboardMetrics }) {
  const rt = m.resolutionTime;
  const sla = m.slaCompliance;
  return (
    <>
        <MetricTile
          label="Median resolution time"
          {...(!rt
            ? { pending: FAILED }
            : rt.overall.medianHours === null
              ? { pending: needs(m, rt.overall.resolved) }
              : {
                  value: duration(rt.overall.medianHours).split(" ")[0],
                  unit: duration(rt.overall.medianHours).split(" ")[1],
                  trend: `${rt.overall.resolved.toLocaleString("en-IN")} issues · first report to resolution`,
                })}
        />
        <MetricTile
          label="SLA compliance"
          {...(!sla
            ? { pending: FAILED }
            : sla.rate === null
              ? { pending: needs(m, sla.resolved) }
              : {
                  value: `${Math.round(sla.rate * 100)}%`,
                  trend: `${sla.onTime.toLocaleString("en-IN")} of ${sla.resolved.toLocaleString("en-IN")} fixes claimed on time`,
                })}
        />
    </>
  );
}

const SHORT_DESKTOP = "(min-width: 1280px) and (min-height: 600px) and (max-height: 699px)";
function subscribeShortDesktop(onChange: () => void) {
  const media = window.matchMedia(SHORT_DESKTOP);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const shortDesktopSnapshot = () => window.matchMedia(SHORT_DESKTOP).matches;
const serverShortDesktopSnapshot = () => false;

function Aggregates({ m, selected }: { m: DashboardMetrics; selected: DetailView }) {
  const shortDesktop = useSyncExternalStore(subscribeShortDesktop, shortDesktopSnapshot, serverShortDesktopSnapshot);
  const { session } = useAuth();
  return (
    <>
      <DashboardSection title="Complaint trends" selected={selected}>
        <p className="mt-1 text-dense text-ink-muted" style={{ maxWidth: "var(--measure-prose)" }}>
          Daily new and resolved issues. The backlog grows when gray is above green.
        </p>
        <div className="mt-3">
          {m.reportedVsResolved ? (
            <TrendChart
              title="New issues and resolved issues per day, last 90 days"
              height={shortDesktop && !session ? 144 : 220}
              series={[
                { key: "reported", label: "New issues", color: "var(--chart-context)" },
                { key: "resolved", label: "Resolved", color: "var(--st-resolved)" },
              ]}
              rows={m.reportedVsResolved}
            />
          ) : (
            <p className="text-dense text-ink-muted">{FAILED}</p>
          )}
        </div>
      </DashboardSection>

      <DashboardSection title="Most reported complaints" selected={selected}>
        {m.topClusters === null ? <p className="text-dense text-ink-muted">{FAILED}</p> : m.topClusters.length === 0 ? (
          <p className="text-dense text-ink-muted">No open issues yet.</p>
        ) : (
          <ol className="mt-3 list-none p-0 border-t border-rule">
            {m.topClusters.map((c) => (
              <li key={c.id} className="border-b border-rule py-3 flex flex-wrap items-center gap-x-5 gap-y-1">
                <TicketRef publicRef={c.publicRef} issueId={c.id} />
                <StatusRule status={c.status} />
                <Link href={`/issues/${c.id}`} className="text-dense text-ink underline">
                  {c.categoryName}
                </Link>
                <span className="text-dense text-ink-muted">{c.wardName}</span>
                <span className="ml-auto text-dense">
                  <strong>{reporters(c.distinctReporterCount)}</strong>
                  <span className="text-ink-muted"> · {c.reportCount} reports</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </DashboardSection>
    </>
  );
}

/** A share as a whole percentage. Never called with a zero denominator. */
function pct(part: number, whole: number): string {
  return `${Math.round((part / whole) * 100)}%`;
}

/**
 * How claimed fixes fared with citizens, city-wide and per department.
 *
 * The two rates have different denominators, deliberately (see
 * IssueRepository.findDepartmentAccountability): unverified is out of issues
 * resolved, reopened is out of fixes ever claimed. A null rate is a department
 * with no denominator yet, and it says so in words -- "0%" would claim a
 * perfect record nobody has earned.
 */
function DepartmentRecord() {
  const departments = useDepartmentAccountability();

  if (departments.isPending) return <MetricPlaceholders count={2} label="Loading the department figures" />;

  if (departments.isError) {
    return (
      <ErrorState
        action="Loading the department figures"
        problem={(departments.error as ApiError)?.problem}
        onRetry={() => void departments.refetch()}
      />
    );
  }

  const rows = departments.data;
  const total = (f: (d: DepartmentAccountability) => number) => rows.reduce((n, d) => n + f(d), 0);
  const resolved = total((d) => d.resolved);
  const unverified = total((d) => d.resolvedWithoutVerification);
  const claimed = total((d) => d.fixesClaimed);
  const reopened = total((d) => d.reopened);

  return (
    <>
        <MetricTile
          label="Reopen rate"
          {...(claimed === 0
            ? { pending: "Awaiting the first claimed fix." }
            : {
                value: pct(reopened, claimed),
                trend: `${reopened.toLocaleString("en-IN")} of ${claimed.toLocaleString("en-IN")} claimed fixes reopened`,
              })}
        />
        <MetricTile
          label="Resolved without citizen verification"
          {...(resolved === 0
            ? { pending: "Awaiting the first resolved issue." }
            : {
                value: pct(unverified, resolved),
                trend: `${unverified.toLocaleString("en-IN")} of ${resolved.toLocaleString("en-IN")} resolved issues`,
              })}
        />
    </>
  );

}
