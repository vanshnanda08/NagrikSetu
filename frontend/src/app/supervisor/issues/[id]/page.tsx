"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { StatusRule } from "@/components/StatusRule";
import { TicketRef } from "@/components/TicketRef";
import { useAuth } from "@/lib/auth";
import { ApiError, request } from "@/lib/api";
import { absoluteDateTime, ageLabel, metres, reporters } from "@/lib/format";
import { invalidateAfterModeration } from "@/lib/moderation";
import { useCategories, useIssue } from "@/lib/queries";
import { useSignIn } from "@/lib/signInDialog";
import type { ModerationEntry, ModerationResult, PublicIssue, PublicReport, WardOption } from "@/lib/types";

/** Statuses in which an issue's grouping, ward or category may still be changed (mirrors ModerationService). */
const MOVABLE = ["NEW", "ACKNOWLEDGED", "ASSIGNED", "IN_PROGRESS", "REOPENED"];
const RECATEGORISABLE = ["NEW", "ACKNOWLEDGED"];
const SETTLED = ["RESOLVED", "CLOSED", "REJECTED"];

/**
 * Moderation view (blueprint 3.19): the one place a supervisor can recategorise,
 * reject or reassign the ward of any issue they are responsible for, with the
 * permanent log of what has been done to it.
 *
 * Every action here is checked again by the server, which is the authority; the
 * client only avoids offering what it already knows will be refused, and prints
 * the server's own sentence when one is.
 */
export default function ModerateIssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { session, initialising } = useAuth();
  const { openSignIn } = useSignIn();
  const issue = useIssue(id);
  const isSupervisor = session?.role === "SUPERVISOR" || session?.role === "ADMIN";

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
        <h1 className="text-display">Moderate an issue</h1>
        <EmptyState
          message={
            session
              ? "Moderation is for supervisors and administrators."
              : "Sign in with a supervisor account to moderate issues."
          }
          {...(session ? {} : { actionLabel: "Sign in", onAction: openSignIn })}
        />
      </PageShell>
    );
  }

  if (issue.isPending) {
    return (
      <PageShell>
        <LoadingState label="Loading the issue" />
      </PageShell>
    );
  }

  if (issue.isError || !issue.data) {
    return (
      <PageShell>
        <ErrorState
          action="Loading the issue"
          problem={(issue.error as ApiError)?.problem}
          onRetry={() => void issue.refetch()}
        />
      </PageShell>
    );
  }

  return <Moderate i={issue.data} />;
}

function Moderate({ i }: { i: PublicIssue }) {
  const movable = MOVABLE.includes(i.status);
  return (
    <PageShell wide>
      <p className="text-meta">
        <Link href={`/issues/${i.id}`} className="underline text-ink">
          ← The issue
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
        <TicketRef publicRef={i.publicRef} issueId={i.id} />
        <StatusRule status={i.status} audience="staff" />
      </div>
      <h1 className="mt-2 text-display">Moderate</h1>
      <p className="mt-1 text-body text-ink-muted">
        {i.categoryName} · {i.wardName} · {reporters(i.distinctReporterCount)} across {i.reportCount} report
        {i.reportCount === 1 ? "" : "s"} · {ageLabel(i.firstReportedAt)}
      </p>
      <p className="mt-1 text-meta text-ink-muted">
        Nothing here deletes a report. Every action is permanently logged with who did it and when.
      </p>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-8">
        <div className="flex flex-col gap-8">
          <Recategorise i={i} allowed={RECATEGORISABLE.includes(i.status)} />
          <ReassignWard i={i} allowed={movable} />
        </div>
        <div className="flex flex-col gap-8">
          <Reject i={i} allowed={!SETTLED.includes(i.status)} />
          <section>
            <h2 className="text-heading">Split or merge</h2>
            <p className="mt-1 text-dense text-ink-muted" style={{ maxWidth: "var(--measure-prose)" }}>
              Move some reports to a new issue, or fold a duplicate into this one. Both show a preview first.
            </p>
            <p className="mt-3">
              {movable ? (
                <Link href={`/supervisor/issues/${i.id}/cluster`} className="text-body underline text-ink">
                  Open the split and merge tool
                </Link>
              ) : (
                <span className="text-dense text-ink-muted">
                  Reports can only be moved while an issue is open and not waiting for citizens to verify a fix.
                </span>
              )}
            </p>
          </section>
        </div>
      </div>

      <Redactions i={i} />
      <ModerationLog issueId={i.id} />
    </PageShell>
  );
}

function Redactions({ i }: { i: PublicIssue }) {
  const reports = useQuery({
    queryKey: ["issue", "reports", i.id],
    queryFn: () => request<PublicReport[]>(`/public/issues/${i.id}/reports`),
    staleTime: 0,
  });
  return (
    <section className="mt-10">
      <h2 className="text-heading">Public descriptions</h2>
      <p className="mt-1 text-dense text-ink-muted">
        Redaction hides harmful text publicly but keeps the original evidence and records your reason permanently.
      </p>
      {reports.isPending && <LoadingState label="Loading descriptions" />}
      {reports.isError && <ErrorState action="Loading descriptions" problem={(reports.error as ApiError)?.problem} />}
      {reports.data && (
        <ol className="mt-3 list-none p-0 border-t border-rule">
          {reports.data.map((report) => <RedactionRow key={report.id} issue={i} report={report} />)}
        </ol>
      )}
    </section>
  );
}

function RedactionRow({ issue, report }: { issue: PublicIssue; report: PublicReport }) {
  const act = useAct(issue);
  const [reason, setReason] = useState("");
  const alreadyRedacted = report.description === "[Description removed by a supervisor]";
  return (
    <li className="border-b border-rule py-3">
      <p className="text-dense">Report {report.sequence}: {report.description || "No description supplied."}</p>
      {report.description && !alreadyRedacted && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex min-w-64 flex-col gap-1 text-meta">
            Redaction reason (at least 10 characters)
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500}
              className="bg-surface-raised text-body text-ink border border-rule px-3"
              style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)" }} />
          </label>
          <Button disabled={reason.trim().length < 10 || act.isPending}
            onClick={() => act.mutate({
              path: `/supervisor/issues/${issue.id}/reports/${report.id}/redact`,
              body: { reason: reason.trim() },
            })}>
            Redact public text
          </Button>
        </div>
      )}
      {act.isSuccess && <Notice text="Description redacted; the original remains in the audit record." />}
      {act.isError && <ErrorState action="Redacting the description" problem={(act.error as ApiError)?.problem} />}
    </li>
  );
}

function useAct(i: PublicIssue) {
  const { authed } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { path: string; body: unknown }) =>
      authed((token) => request<ModerationResult | unknown>(a.path, { method: "POST", token, body: a.body })),
    onSuccess: () => invalidateAfterModeration(qc),
    meta: { issueId: i.id },
  });
}

function Notice({ text }: { text: string }) {
  return (
    <p role="status" className="mt-3 text-dense border-l-4 border-ink pl-3">
      {text}
    </p>
  );
}

function Unavailable({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-dense text-ink-muted" style={{ maxWidth: "var(--measure-prose)" }}>{children}</p>;
}

function Recategorise({ i, allowed }: { i: PublicIssue; allowed: boolean }) {
  const categories = useCategories();
  const act = useAct(i);
  const [code, setCode] = useState("");

  return (
    <section>
      <h2 className="text-heading">Recategorise</h2>
      <p className="mt-1 text-dense" style={{ maxWidth: "var(--measure-prose)" }}>
        Recategorising takes this issue out of its cluster: it becomes a cluster of its own in the new
        category, keeps its ticket number and reports, and is not merged with anything automatically. It also
        moves to the department that owns the new category.
      </p>
      {!allowed ? (
        <Unavailable>
          Only new or acknowledged issues can be recategorised. Once work is assigned, changing the category would
          move it to another department mid-job.
        </Unavailable>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-meta">
            New category
            <select value={code} onChange={(e) => setCode(e.target.value)}
              className="bg-surface-raised text-body text-ink border border-rule px-3"
              style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)" }}>
              <option value="">Choose…</option>
              {categories.data?.filter((c) => c.code !== i.categoryCode).map((c) => (
                <option key={c.code} value={c.code}>{c.displayName}</option>
              ))}
            </select>
          </label>
          <Button disabled={!code || act.isPending}
            onClick={() => act.mutate({ path: `/supervisor/issues/${i.id}/recategorise`, body: { categoryCode: code } })}>
            Move to this category
          </Button>
        </div>
      )}
      {act.isSuccess && <Notice text="Recategorised." />}
      {act.isError && <ErrorState action="Recategorising" problem={(act.error as ApiError)?.problem} />}
    </section>
  );
}

function ReassignWard({ i, allowed }: { i: PublicIssue; allowed: boolean }) {
  const { authed, session } = useAuth();
  const act = useAct(i);
  const [wardId, setWardId] = useState("");
  const [note, setNote] = useState("");

  const options = useQuery({
    queryKey: ["supervisor", "ward-options", i.id, session?.userId, i.wardId],
    queryFn: () => authed((token) => request<WardOption[]>(`/supervisor/issues/${i.id}/ward-options`, { token })),
    enabled: allowed,
    staleTime: 30_000,
  });

  return (
    <section>
      <h2 className="text-heading">Reassign ward</h2>
      <p className="mt-1 text-dense" style={{ maxWidth: "var(--measure-prose)" }}>
        For a pin that fell on the wrong side of a boundary line. The ward decides which ward officer an escalation
        reaches. The reports keep their own locations; only the issue&apos;s ward changes. To merge with an issue in
        another ward, reassign first, then merge.
      </p>
      {!allowed ? (
        <Unavailable>The ward can only be changed while an issue is open and not waiting for citizens to verify a fix.</Unavailable>
      ) : (
        <>
          {options.isPending && <LoadingState label="Finding nearby wards" />}
          {options.isError && <ErrorState action="Finding nearby wards" problem={(options.error as ApiError)?.problem} />}
          {options.data && (
            <div className="mt-3 flex flex-col gap-3" style={{ maxWidth: 520 }}>
              <label className="flex flex-col gap-1 text-meta">
                Move to
                <select value={wardId} onChange={(e) => setWardId(e.target.value)}
                  className="bg-surface-raised text-body text-ink border border-rule px-3"
                  style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)" }}>
                  <option value="">Choose a ward…</option>
                  {options.data.map((w) => (
                    <option key={w.id} value={w.id} disabled={w.current || !w.allowed}>
                      {w.name}
                      {w.current ? " (current)" : w.distanceM === 0 ? "" : ` – ${metres(w.distanceM)} away`}
                      {!w.current && !w.allowed ? " – too far" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-meta">
                Why (optional, kept in the log)
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
                  className="bg-surface-raised text-body text-ink border border-rule px-3"
                  style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)" }} />
              </label>
              <div>
                <Button disabled={!wardId || act.isPending}
                  onClick={() => act.mutate({
                    path: `/supervisor/issues/${i.id}/reassign-ward`,
                    body: { wardId, ...(note.trim() ? { note: note.trim() } : {}) },
                  })}>
                  Reassign to this ward
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {act.isSuccess && <Notice text="Ward reassigned." />}
      {act.isError && <ErrorState action="Reassigning the ward" problem={(act.error as ApiError)?.problem} />}
    </section>
  );
}

function Reject({ i, allowed }: { i: PublicIssue; allowed: boolean }) {
  const act = useAct(i);
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();

  return (
    <section>
      <h2 className="text-heading">Reject</h2>
      <p className="mt-1 text-dense" style={{ maxWidth: "var(--measure-prose)" }}>
        For something that is not a real, actionable problem. The reason is sent to <strong>everyone who reported
        it</strong>, so write it for them. The issue stays visible as rejected; no report is deleted.
      </p>
      {!allowed ? (
        <Unavailable>This issue is already settled, so there is nothing to reject.</Unavailable>
      ) : (
        <div className="mt-3" style={{ maxWidth: "var(--measure-prose)" }}>
          <label className="flex flex-col gap-1 text-meta">
            Reason, sent to every reporter (at least 20 characters)
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000}
              className="bg-surface-raised text-body text-ink border border-rule px-3 py-2"
              style={{ borderRadius: "var(--radius)" }} />
          </label>
          <p className="mt-1 text-meta text-ink-muted">{trimmed.length} of 20 characters minimum</p>
          <div className="mt-2">
            <Button disabled={trimmed.length < 20 || act.isPending}
              onClick={() => act.mutate({ path: `/issues/${i.id}/reject`, body: { reason: trimmed } })}>
              Reject this issue
            </Button>
          </div>
        </div>
      )}
      {act.isSuccess && <Notice text="Rejected. Everyone who reported it has been told why." />}
      {act.isError && <ErrorState action="Rejecting" problem={(act.error as ApiError)?.problem} />}
    </section>
  );
}

const ACTION_WORD: Record<ModerationEntry["action"], string> = {
  CONFIRM: "Grouping confirmed",
  SPLIT: "Split",
  MERGE: "Merged",
  RECATEGORISE: "Recategorised",
  REASSIGN_WARD: "Ward reassigned",
  REDACT: "Description redacted",
};

function describe(e: ModerationEntry): string {
  const d = e.detail as Record<string, unknown>;
  if (e.action === "REASSIGN_WARD") return `${String(d.fromWard ?? "?")} → ${String(d.toWard ?? "?")}`;
  if (e.action === "RECATEGORISE") return `${String(d.fromCategory ?? "?")} → ${String(d.toCategory ?? "?")}`;
  if (e.action === "REDACT") return `Report ${String(d.reportId ?? "?")}`;
  return "";
}

function ModerationLog({ issueId }: { issueId: string }) {
  const { authed, session } = useAuth();
  const log = useQuery({
    queryKey: ["supervisor", "moderation", issueId, session?.userId],
    queryFn: () => authed((token) => request<ModerationEntry[]>(`/supervisor/issues/${issueId}/moderation`, { token })),
    staleTime: 0,
  });

  return (
    <section className="mt-10">
      <h2 className="text-heading">Moderation log</h2>
      {log.isPending && <LoadingState label="Loading the log" />}
      {log.isError && <ErrorState action="Loading the log" problem={(log.error as ApiError)?.problem} />}
      {log.data && log.data.length === 0 && <p className="mt-2 text-dense text-ink-muted">Nothing has been done to this issue yet.</p>}
      {log.data && log.data.length > 0 && (
        <ol className="mt-3 list-none p-0 border-t border-rule">
          {log.data.map((e) => (
            <li key={e.id} className="border-b border-rule py-3">
              <div className="flex flex-wrap items-baseline gap-x-4">
                <strong className="text-body">{ACTION_WORD[e.action]}</strong>
                <span className="text-meta text-ink-muted">by {e.actorRole.toLowerCase()}</span>
                <span className="ml-auto text-meta text-ink-muted">{absoluteDateTime(e.createdAt)}</span>
              </div>
              {describe(e) && <p className="mt-1 text-dense">{describe(e)}</p>}
              {e.note && <p className="mt-1 text-dense text-ink-muted">{e.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
