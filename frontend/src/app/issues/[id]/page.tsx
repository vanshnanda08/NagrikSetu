"use client";

import { AdministrativeClosureNotice } from "@/components/AdministrativeClosureNotice";

import Link from "next/link";
import { use, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { StatusRule } from "@/components/StatusRule";
import { TicketRef } from "@/components/TicketRef";
import { PriorityBadge } from "@/components/PriorityBadge";
import { DeadlineCountdown } from "@/components/DeadlineCountdown";
import { MapCanvas } from "@/components/MapCanvas";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { useIssue, useIssueHistory, useIssueReports } from "@/lib/queries";
import { STATUS, isOverdue } from "@/lib/status";
import { absoluteDateTime, ageLabel, coordinates, metres, reporters } from "@/lib/format";
import { isUnknownTicket, type ApiError } from "@/lib/api";
import { canCloseComplaint } from "@/lib/adminClosure";
import { useAuth } from "@/lib/auth";
import { IssueEngagement } from "@/components/IssueEngagement";
import { EvidencePhoto } from "@/components/EvidencePhoto";
import { SectionTabs } from "@/components/SectionTabs";
import { useSignIn } from "@/lib/signInDialog";
import { ticketWorkReturn } from "@/lib/navigation";

/**
 * Issue detail (blueprint §3.6): everything publicly known about one work item.
 *
 * The timeline shows the actor's ROLE and never a name, because reporter and
 * staff identity is not public. The server enforces that -- `PublicHistoryDto`
 * has no name and no id to render -- so this screen could not leak one if it
 * tried, which is the right place for that guarantee to live.
 */
export default function IssueDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const { id } = use(params);
  const backToWork = ticketWorkReturn(use(searchParams).returnTo);
  const issue = useIssue(id);
  const reports = useIssueReports(id);
  const history = useIssueHistory(id);
  const { session } = useAuth();
  const { openSignIn } = useSignIn();
  const [activity, setActivity] = useState("history");
  const canModerate = session?.role === "SUPERVISOR" || session?.role === "ADMIN";

  if (issue.isPending) {
    return (
      <PageShell wide>
        <BackToWork href={backToWork} />
        <LoadingState label="Loading issue" />
      </PageShell>
    );
  }

  if (issue.isError) {
    const err = issue.error as ApiError;
    // A missing ticket renders the not-found screen with a way onward, never
    // a redirect (blueprint §3.6). A redirect would destroy the URL somebody
    // was sent. "Missing" includes an id the server could not parse -- a
    // pasted ticket reference -- which is a wrong URL, not a dead connection.
    return (
      <PageShell>
        <BackToWork href={backToWork} />
        {isUnknownTicket(err) ? (
          <>
            <h1 className="text-display">No such ticket</h1>
            <p className="mt-3 text-body">
              Nothing here has that reference. It may have been typed slightly wrong.
            </p>
            <p className="mt-4">
              <Link href="/issues" className="text-body underline text-ink">
                Search the issue index
              </Link>
            </p>
          </>
        ) : (
          <ErrorState action="Loading this issue" problem={err?.problem} onRetry={() => void issue.refetch()} />
        )}
      </PageShell>
    );
  }

  const i = issue.data;
  const overdue = isOverdue(i.status, i.effectiveDeadline);

  const mapQuery = new URLSearchParams({ view: "map", status: i.status, c: `${i.lat - .002},${i.lng - .002},${i.lat + .002},${i.lng + .002}`, z: "17" });
  return (
    <PageShell wide className="issue-overview-page">
      <header className="issue-summary">
        <BackToWork href={backToWork} />
        <div className="issue-reference-row">
          <TicketRef publicRef={i.publicRef} copyable />
          <StatusRule status={i.status} overdue={overdue} />
          <PriorityBadge priority={i.priority} score={i.priorityScore} />
          <span className="issue-deadline"><DeadlineCountdown status={i.status} effectiveDeadline={i.effectiveDeadline} pausedSeconds={i.pausedSeconds} resolvedAt={i.resolvedAt} /></span>
        </div>
        <div className="issue-heading-row">
          <div><h1 className="text-display">{i.categoryName}</h1><p className="text-dense text-ink-muted">{i.wardName}{i.departmentName ? ` · ${i.departmentName}` : ""} · {ageLabel(i.firstReportedAt)}</p></div>
          <dl className="issue-facts">
            <Fact label="Reporters"><Link href={`/issues/${i.id}/cluster`} className="underline">{reporters(i.distinctReporterCount)} · {i.reportCount} report{i.reportCount === 1 ? "" : "s"}</Link></Fact>
            <Fact label="Deadline">{absoluteDateTime(i.effectiveDeadline)}</Fact>
            {i.escalationLevel > 0 && <Fact label="Escalated">Level {i.escalationLevel} of 4</Fact>}
            {i.reopenCount > 0 && <Fact label="Reopened">{i.reopenCount} time{i.reopenCount === 1 ? "" : "s"}</Fact>}
          </dl>
        </div>
        {i.mergedIntoId && <p role="status" className="issue-merge-notice text-dense">This complaint was joined with <Link href={`/issues/${i.mergedIntoId}`} className="underline">{i.mergedIntoRef}</Link>. Its reports now count there; follow that ticket for progress.</p>}
      </header>

      <div className="issue-overview-grid">
        <section className="issue-panel issue-evidence" aria-labelledby="evidence-heading">
          <AdministrativeClosureNotice status={i.status} resolvedAt={i.resolvedAt} />
          <h2 id="evidence-heading" className="text-heading">Evidence & fix</h2>
          <div className="issue-panel-content" tabIndex={0} role="region" aria-label="Issue photos and repair details">
            <h3 className="text-dense font-semibold">Photos</h3>
            {reports.isPending && <LoadingState label="Loading report photos" />}
            {reports.isError && <ErrorState action="Loading report photos" problem={(reports.error as ApiError)?.problem} onRetry={() => void reports.refetch()} />}
            {reports.data?.length === 0 && <p className="text-dense text-ink-muted">No report photos available.</p>}
            <div className="issue-photo-strip" tabIndex={reports.data && reports.data.length > 2 ? 0 : undefined} aria-label="Report photos">
              {reports.data?.map(r => <EvidencePhoto key={r.id} src={r.photoUrl} label={`Report ${r.sequence}${r.landmark ? `, ${r.landmark}` : ""}`} />)}
              {i.resolutionPhotoUrl && <EvidencePhoto src={i.resolutionPhotoUrl} label="Repair proof" />}
            </div>
            {reports.data && reports.data.length > 0 && <section className="issue-report-details" aria-labelledby="report-details-heading">
              <h3 id="report-details-heading" className="text-dense font-semibold">Report details</h3>
              <ol className="list-none m-0 p-0">{reports.data.map(report => <li key={report.id} className="issue-report-note">
                <div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="text-meta font-semibold">Report {report.sequence}</h4><time className="text-meta text-ink-muted" dateTime={report.createdAt}>{absoluteDateTime(report.createdAt)}</time></div>
                <p className="text-dense whitespace-pre-wrap">{report.description?.trim() || "No description was provided with this report."}</p>
                {report.landmark && <p className="text-meta text-ink-muted">Landmark: {report.landmark}</p>}
              </li>)}</ol>
            </section>}
            {i.status === "RESOLVED" || i.resolutionPhotoUrl ? <section className="issue-fix">
              <h3 className="text-heading">Repair evidence</h3>
              {i.resolutionNote && <p className="text-dense">{i.resolutionNote}</p>}
            </section> : <p className="text-dense text-ink-muted issue-fix">No repair proof has been submitted yet.</p>}
            {i.resolvedAt && i.resolvedWithoutVerification && <p className="issue-verification-notice text-dense">Resolved without citizen confirmation. Verification figures are published on the <Link href="/dashboard" className="underline">dashboard</Link>.</p>}
          </div>
        </section>

        <section className="issue-panel issue-location" aria-labelledby="location-heading">
          <h2 id="location-heading" className="text-heading">Location & grouping</h2>
          <div className="issue-panel-content" tabIndex={0} role="region" aria-label="Location and grouping information">
            <div className="issue-location-map"><MapCanvas center={{ lat: i.lat, lng: i.lng }} zoom={17} height={190} markers={[{ id: i.id, lat: i.lat, lng: i.lng, kind: "centroid", color: STATUS[i.status].color, overdue, label: i.publicRef }]} /></div>
            <p className="issue-coordinates text-ref font-mono"><span className="text-meta font-sans text-ink-muted">Centroid </span>{coordinates(i.lat, i.lng)}</p>
            <dl className="issue-grouping-facts">
              <Fact label="Report span">{metres(i.clusterExtentM)}</Fact>
              <Fact label="Grouping cap">{metres(i.clusterExtentCapM)}</Fact>
              <Fact label="GPS uncertainty">{metres(i.positionalUncertaintyM)}</Fact>
            </dl>
            <div className="issue-context-links">
              <Link href={`/issues?${mapQuery}`} className="text-dense underline">Larger map</Link>
              <Link href={`/issues/${i.id}/cluster`} className="text-dense underline">Grouped reports</Link>
              {canCloseComplaint(session?.role, i.status) && <Link href={`/work?view=assignments&tab=${i.status === "RESOLVED" ? "ready_to_close" : "all"}&issue=${i.id}`} className="text-dense underline">Close complaint</Link>}
              {canModerate && !i.mergedIntoId && <details><summary className="text-dense">Staff tools</summary><Link href={`/supervisor/issues/${i.id}/cluster`} className="text-dense underline">Split or merge</Link><Link href={`/supervisor/issues/${i.id}`} className="text-dense underline">Moderate</Link></details>}
            </div>
          </div>
        </section>

        <section className="issue-panel issue-activity" aria-label="Complaint activity">
          <SectionTabs label="Complaint activity" prefix="issue-activity" items={[{ id: "history", label: "History" }, { id: "updates", label: "Updates & questions" }]} current={activity} onChange={setActivity} />
          <div id="issue-activity-panel-history" role="tabpanel" aria-labelledby="issue-activity-tab-history" hidden={activity !== "history"} className="issue-panel-content" tabIndex={0}>
            <h2 className="text-heading">What has happened</h2>
            {history.isPending && <LoadingState label="Loading the timeline" />}
            {history.isError && <ErrorState action="Loading the timeline" problem={(history.error as ApiError)?.problem} onRetry={() => void history.refetch()} />}
            {history.data?.length === 0 && <p className="text-dense text-ink-muted">Reported, and not yet picked up by the department.</p>}
            <ol className="issue-timeline list-none p-0">
              {history.data?.map((h, n) => <li key={n}><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><StatusRule status={h.toStatus} audience="staff" /><span className="text-meta text-ink-muted">by {h.actorRole.toLowerCase()}</span></div><time className="text-meta text-ink-muted" dateTime={h.createdAt}>{absoluteDateTime(h.createdAt)}</time>{h.note && <p className="text-dense">{h.note}</p>}</li>)}
            </ol>
          </div>
          <div id="issue-activity-panel-updates" role="tabpanel" aria-labelledby="issue-activity-tab-updates" hidden={activity !== "updates"} className="issue-panel-content" tabIndex={0}>
            {session ? <IssueEngagement issueId={i.id} /> : <div><h2 className="text-heading">Updates & questions</h2><p className="text-dense text-ink-muted">Sign in to follow this complaint or view eligible private clarification.</p><button type="button" className="issue-sign-in" onClick={() => openSignIn()}>Sign in</button></div>}
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="issue-fact">
      <dt className="text-meta text-ink-muted">{label}</dt>
      <dd className="m-0 text-dense">{children}</dd>
    </div>
  );
}

function BackToWork({ href }: { href: string | null }) {
  return href ? <Link href={href} className="ticket-back-link text-dense underline">← Back to work queue</Link> : null;
}
