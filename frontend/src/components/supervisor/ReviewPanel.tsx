"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { WorkIssuePanel } from "@/components/work/WorkIssuePanel";
import { ticketDetailsHref, workHref } from "@/lib/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { ComplaintsShell } from "@/components/work/ComplaintsShell";

import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { StatusRule } from "@/components/StatusRule";
import { TicketRef } from "@/components/TicketRef";
import { ClusterThumbnail } from "@/components/ClusterThumbnail";
import { useAuth } from "@/lib/auth";
import { ApiError, request } from "@/lib/api";
import { ageLabel, metres, reporters } from "@/lib/format";
import { invalidateAfterModeration, reviewCause } from "@/lib/moderation";
import { useSignIn } from "@/lib/signInDialog";
import type { ModerationResult, ReviewItem, ReviewPage } from "@/lib/types";

const PAGE = 25;

/**
 * Review queue (blueprint 3.17): every issue the clustering engine flagged for
 * a person, from all three causes, each labelled with its cause in words.
 *
 * Actions per row: confirm the grouping, open the split and merge tool,
 * or open the issue moderation view for category, ward, rejection and privacy
 * actions. Scoped server-side to the caller's department or ward.
 */
export default function ReviewQueuePage() {
  const params = useSearchParams();
  const selectedIssue = params.get("issue");
  const { session, initialising, authed } = useAuth();
  const { openSignIn } = useSignIn();
  const router = useRouter();
  const requestedOffset = Number(params.get("reviewOffset"));
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;
  const isSupervisor = session?.role === "SUPERVISOR" || session?.role === "ADMIN";

  const page = useQuery({
    queryKey: ["supervisor", "review", session?.userId, offset],
    queryFn: () => authed((token) => request<ReviewPage>(`/supervisor/review?limit=${PAGE}&offset=${offset}`, { token })),
    enabled: Boolean(isSupervisor),
    staleTime: 30_000,
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
        <h1 className="text-display">Review queue</h1>
        <EmptyState
          message={
            session
              ? "The review queue is for supervisors and administrators."
              : "Sign in with a supervisor account to see issues waiting for review."
          }
          {...(session ? {} : { actionLabel: "Sign in", onAction: openSignIn })}
        />
      </PageShell>
    );
  }

  return (
    <ComplaintsShell view="review">
      <h2 className="text-heading">Review queue</h2>
      <p className="mt-1 text-dense text-ink-muted" style={{ maxWidth: "var(--measure-prose)" }}>
        Groupings the clustering engine was not sure about. Oldest first.
      </p>

      {page.isPending && <LoadingState label="Loading the review queue" />}
      {page.isError && (
        <ErrorState
          action="Loading the review queue"
          problem={(page.error as ApiError)?.problem}
          onRetry={() => void page.refetch()}
        />
      )}

      {page.data && page.data.items.length === 0 && <EmptyState message={offset ? "No groupings on this page." : "Nothing needs review."} {...(offset ? { actionLabel: "Back to first page", actionHref: workHref(params.toString(), { reviewOffset: null, issue: null }) } : {})} />}
      {page.data && page.data.items.length === 0 && selectedIssue && <div className="work-master-detail detail-only has-selection"><WorkIssuePanel issueId={selectedIssue} closeHref={workHref(params.toString(), { issue: null })} /></div>}

      {page.data && page.data.items.length > 0 && (
        <>
          <p className="mt-4 text-meta text-ink-muted">{offset + 1}–{offset + page.data.items.length} of {page.data.total} waiting</p>
          <div className={`work-master-detail${selectedIssue ? " has-selection" : ""}`}>
          <div className="work-queue" role="region" aria-label="Grouping review queue">
          <ol className="work-list list-none p-0 border-t border-rule" tabIndex={0}>
            {page.data.items.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </ol>
          </div>
          {selectedIssue ? <WorkIssuePanel issueId={selectedIssue} closeHref={workHref(params.toString(), { issue: null })} /> : <div className="work-empty-detail"><h2 className="text-heading">Review a grouping</h2><p className="text-dense text-ink-muted mt-2">Inspect the grouping, open its work details or use the moderation tools.</p></div>}
          </div>

        </>
      )}
      {page.data && (offset > 0 || offset + page.data.items.length < page.data.total) && (
        <nav className="work-queue-pagination flex items-center justify-between gap-3 border-t border-rule pt-2" aria-label="Review queue pages">
          <Button variant="secondary" disabled={offset === 0 || page.isFetching} onClick={() => router.push(workHref(params.toString(), { reviewOffset: offset > PAGE ? String(offset - PAGE) : null, issue: null }), { scroll: false })}>Previous</Button>
          <Button variant="secondary" disabled={offset + page.data.items.length >= page.data.total || page.isFetching} onClick={() => router.push(workHref(params.toString(), { reviewOffset: String(offset + PAGE), issue: null }), { scroll: false })}>Next</Button>
        </nav>
      )}
    </ComplaintsShell>
  );
}

function Row({ item }: { item: ReviewItem }) {
  const params = useSearchParams();
  const { authed } = useAuth();
  const qc = useQueryClient();
  const cause = reviewCause(item.reviewReason);

  const act = useMutation({
    mutationFn: (a: { path: string; body: unknown }) =>
      authed((token) => request<ModerationResult | unknown>(a.path, { method: "POST", token, body: a.body })),
    onSuccess: () => invalidateAfterModeration(qc),
  });

  return (
    <li className="border-b border-rule py-4">
      <div className="flex flex-wrap gap-4">
        <ClusterThumbnail lat={item.lat} lng={item.lng} points={item.points} capM={item.extentCapM} />

        <div className="flex-1 min-w-[16rem]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <TicketRef publicRef={item.publicRef} issueId={item.id} />
            <StatusRule status={item.status} audience="staff" />
            <span className="text-meta text-ink-muted">flagged {ageLabel(item.firstReportedAt)}</span>
          </div>
          <p className="mt-1 text-body">
            <strong>{cause.title}.</strong> {item.categoryName} · {item.wardName}
          </p>
          <p className="mt-1 text-dense text-ink-muted" style={{ maxWidth: "var(--measure-prose)" }}>
            {cause.explain}
          </p>
          <p className="mt-1 text-meta text-ink-muted">
            {reporters(item.distinctReporterCount)} across {item.reportCount} report{item.reportCount === 1 ? "" : "s"} ·
            spans {metres(item.extentM)} of a {metres(item.extentCapM)} cap
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={ticketDetailsHref(item.id, params.toString())} className="work-context-link">View ticket details</Link>
            <Link href={workHref(params.toString(), { view: "review", issue: item.id })} scroll={false} className="work-context-link">Open work details</Link>
            <Button
              variant="secondary"
              disabled={act.isPending}
              onClick={() => act.mutate({ path: `/supervisor/issues/${item.id}/confirm`, body: {} })}
            >
              Confirm grouping
            </Button>
            <Link
              href={`/supervisor/issues/${item.id}/cluster`}
              className="inline-flex items-center px-4 text-dense font-medium border border-ink text-ink no-underline u-press"
              style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)" }}
            >
              Split or merge
            </Link>
            <Link
              href={`/supervisor/issues/${item.id}`}
              className="inline-flex items-center px-4 text-dense font-medium border border-ink text-ink no-underline u-press"
              style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)" }}
            >
              Moderate issue
            </Link>
          </div>

          {act.isError && (
            <ErrorState action="That action" problem={(act.error as ApiError)?.problem} />
          )}
        </div>
      </div>
    </li>
  );
}
