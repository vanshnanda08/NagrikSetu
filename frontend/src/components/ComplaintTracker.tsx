"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { ApiError, request } from "@/lib/api";
import { absoluteDateTime } from "@/lib/format";
import type { PublicIssue } from "@/lib/types";
import { Button } from "./Button";
import { DeadlineCountdown } from "./DeadlineCountdown";
import { StatusRule } from "./StatusRule";

/** Public tracking stays on the dashboard and uses no account credentials. */
export function ComplaintTracker() {
  const [reference, setReference] = useState("");
  const [submittedRef, setSubmittedRef] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const lookup = useQuery({
    queryKey: ["public-complaint-tracking", submittedRef],
    queryFn: ({ signal }) => request<PublicIssue>(
      `/public/issues/by-ref/${encodeURIComponent(submittedRef)}`,
      { signal, cache: "no-store" },
    ),
    enabled: Boolean(submittedRef),
    retry: false,
    refetchInterval: 60_000,
  });
  const busy = Boolean(submittedRef) && lookup.isFetching;
  const issue = lookup.data;
  const problem = lookup.isError
    ? lookup.error instanceof ApiError && lookup.error.status === 404
      ? `No complaint found for ${submittedRef}. Check the complaint number and try again.`
      : "We couldn’t check the complaint right now. Please try again."
    : null;

  function track(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const wanted = reference.trim().toUpperCase();
    if (!wanted) {
      setValidation("Enter the complaint number you received when you submitted your report.");
      return;
    }
    setValidation(null);
    setReference(wanted);
    if (wanted === submittedRef) void lookup.refetch();
    else setSubmittedRef(wanted);
  }

  return (
    <section className="complaint-tracker surface-card" aria-labelledby="complaint-tracker-heading">
      <div className="complaint-tracker-bar">
        <div>
          <h2 id="complaint-tracker-heading" className="text-heading">Track your complaint</h2>
          <p id="complaint-tracker-hint" className="text-meta text-ink-muted">Enter your complaint number. No login required.</p>
        </div>
        <form onSubmit={track} className="complaint-tracker-form" role="search" aria-label="Track a complaint">
          <label htmlFor="complaint-number" className="text-meta">Complaint number</label>
          <div className="complaint-tracker-controls">
            <input
              id="complaint-number"
              name="complaintNumber"
              value={reference}
              onChange={(event) => { setReference(event.target.value); setValidation(null); }}
              placeholder="CT-2026-000123"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={64}
              required
              aria-describedby={`complaint-tracker-hint${validation ? " complaint-tracker-validation" : ""}`}
              aria-invalid={Boolean(validation)}
              className="font-mono text-body"
            />
            <Button type="submit" disabled={busy}>
              <Search size={18} aria-hidden="true" />
              {busy ? "Checking…" : "Track complaint"}
            </Button>
          </div>
        </form>
      </div>
      {validation && <p id="complaint-tracker-validation" role="alert" className="mt-2 text-meta text-st-breached">{validation}</p>}
      {problem && <p role="alert" className="mt-2 text-meta text-st-breached">{problem}</p>}
      <div aria-live="polite" aria-busy={busy}>
        {busy && <p className="mt-2 text-meta text-ink-muted">Checking the latest complaint status…</p>}
        {issue && !lookup.isError && (
          <div className="complaint-tracker-result">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h3 className="text-dense font-semibold">{issue.categoryName} <span className="font-mono">{issue.publicRef}</span></h3>
              <StatusRule status={issue.status} />
              <Link href={`/issues/${issue.id}`} className="text-dense underline">View full complaint history →</Link>
            </div>
            <dl className="complaint-tracker-facts text-meta">
              <div><dt>Ward</dt><dd>{issue.wardName}</dd></div>
              <div><dt>Department</dt><dd>{issue.departmentName ?? "Awaiting assignment"}</dd></div>
              <div><dt>First reported</dt><dd>{absoluteDateTime(issue.firstReportedAt)}</dd></div>
              <div><dt>Resolution deadline</dt><dd><DeadlineCountdown status={issue.status} effectiveDeadline={issue.effectiveDeadline} pausedSeconds={issue.pausedSeconds} resolvedAt={issue.resolvedAt} /></dd></div>
            </dl>
            {issue.mergedIntoId && (
              <p className="mt-2 text-meta">This complaint was combined with <Link href={`/issues/${issue.mergedIntoId}`} className="underline">{issue.mergedIntoRef ?? "another complaint"}. Follow its latest progress →</Link></p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
