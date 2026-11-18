"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { workflowRefresh } from "@/lib/workflowRefresh";
import { PageShell } from "@/components/PageShell";
import { TicketRef } from "@/components/TicketRef";
import { StatusRule } from "@/components/StatusRule";
import { CountUp } from "@/components/CountUp";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { useAuth } from "@/lib/auth";
import { useComposer } from "@/lib/composer";
import { ApiError, request } from "@/lib/api";
import { absoluteDateTime, metres } from "@/lib/format";
import type { ClusterResult, PublicIssue } from "@/lib/types";

/**
 * Report result (blueprint §3.3).
 *
 * "Give the citizen the artifact they have never had before, and tell them
 * honestly what the clustering engine decided."
 *
 * The screen prefers the ingest response handed over from the composer, and
 * falls back to refetching by reference. That fallback is why
 * GET /public/issues/by-ref/{ref} had to exist: without it this page -- the one
 * screen a person will refresh, share and come back to -- breaks on reload.
 *
 * Blueprint §9: a citizen never sees internal vocabulary. The word "merged"
 * does not appear on this screen, and neither does "cluster". They see "you are
 * the 4th person to report this".
 */
export default function ReportSuccessPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = use(params);
  const { session } = useAuth();
  const { reset } = useComposer();

  // The hand-over from the composer is read as INITIAL state, not assigned by
  // an effect. It is already on the device, so there is no moment at which this
  // screen legitimately knows nothing -- rendering a loading state first and
  // correcting it would be a cascading render and a visible flicker on the one
  // screen the citizen is most likely to be staring at.
  const [result] = useState<ClusterResult | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(`ct:${ref}`);
      return raw ? (JSON.parse(raw) as ClusterResult) : null;
    } catch {
      return null;
    }
  });
  const lookup = useQuery({
    ...workflowRefresh,
    queryKey: ["public-complaint-tracking", ref],
    queryFn: ({ signal }) => request<PublicIssue>(`/public/issues/by-ref/${encodeURIComponent(ref)}`, { signal, cache: "no-store" }),
    retry: false,
  });
  const issue = lookup.data;
  const notFound = lookup.error instanceof ApiError && lookup.error.status === 404 && !result && !issue;
  const lookupError = lookup.isError && !notFound ? lookup.error : null;
  const cleared = useRef<string | null>(null);

  useEffect(() => {
    if (!issue || cleared.current === ref) return;
    cleared.current = ref;
    // Clear the delivered draft once, never a new draft created during polling.
    reset();
  }, [issue, ref, reset]);

  const retryStatus = () => { void lookup.refetch(); };

  if (lookupError && !result && !issue) return (
    <PageShell>
      <h1 className="text-display">Report status unavailable</h1>
      <ErrorState action="Loading the report status" problem={lookupError instanceof ApiError ? lookupError.problem : undefined} onRetry={retryStatus} />
      <Link href="/dashboard" className="underline">Back to dashboard</Link>
    </PageShell>
  );

  if (notFound) {
    return (
      <PageShell>
        <h1 className="text-display">That ticket number was not found</h1>
        <p className="mt-3 text-body">
          Nothing here has the reference <span className="font-mono">{ref}</span>. It
          may have been typed slightly wrong.
        </p>
        <p className="mt-4">
          <Link href="/issues" className="text-body underline text-ink">
            Search the issue index
          </Link>
        </p>
      </PageShell>
    );
  }

  if (!result && !issue) {
    return (
      <PageShell>
        <LoadingState label="Loading your ticket" />
      </PageShell>
    );
  }

  const count = result?.reportCount ?? issue?.reportCount ?? 1;
  const first = count <= 1;
  const deadline = result?.dueAt ?? issue?.effectiveDeadline;
  const distance = result?.distanceToClusterM ?? null;

  return (
    <PageShell>
      <h1 className="text-display">Report received</h1>
      {lookupError && <ErrorState action="Refreshing the report status" problem={lookupError instanceof ApiError ? lookupError.problem : undefined} onRetry={retryStatus} />}
      <p className="mt-4 text-meta text-ink-muted">Your ticket number</p>
      <div className="mt-1">
        <TicketRef publicRef={ref} issueId={issue?.id} size="large" copyable />
      </div>

      <section className="mt-8">
        {first ? (
          <>
            <p className="text-heading">First report of this problem.</p>
            {deadline && (
              <p className="mt-2 text-body">Due by {absoluteDateTime(deadline)}.</p>
            )}
          </>
        ) : (
          <>
            <p className="flex items-baseline gap-3">
              <span className="text-body">You are the</span>
              <CountUp to={count} />
              <span className="text-body">person to report this.</span>
            </p>
            <p className="mt-2 text-body">
              {distance != null
                ? `Your report was ${metres(distance)} from the others already on this ticket. `
                : ""}
              {deadline ? `It is due by ${absoluteDateTime(deadline)}.` : ""}
            </p>
            <p className="mt-2 text-dense text-ink-muted" style={{ maxWidth: "var(--measure-prose)" }}>
              More people reporting the same problem raises its priority, which
              shortens its deadline.
            </p>
          </>
        )}
      </section>

      {issue && (
        <section className="mt-8">
          <div className="flex flex-wrap items-center gap-4">
            <StatusRule status={issue.status} />
            <span className="text-dense">{issue.categoryName}</span>
          </div>
          <p className="mt-2 text-dense text-ink-muted">
            {issue.wardName}
            {issue.departmentName ? ` · ${issue.departmentName} is responsible` : ""}
          </p>
          <p className="mt-4">
            <Link href={`/issues/${issue.id}`} className="text-body underline text-ink">
              Follow what happens to this issue
            </Link>
          </p>
        </section>
      )}

      {!session && (
        <section className="mt-8 border-t border-rule pt-4" style={{ maxWidth: "var(--measure-prose)" }}>
          <p className="text-body">
            You reported this anonymously, so nobody can ask you whether it gets
            fixed.
          </p>
          <p className="mt-2">
            <Link href="/register" className="text-body underline text-ink">
              Sign in to be asked whether this gets fixed
            </Link>
          </p>
        </section>
      )}
    </PageShell>
  );
}
