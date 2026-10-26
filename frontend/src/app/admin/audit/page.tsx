"use client";

import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { useAuth } from "@/lib/auth";
import { ApiError, apiBase, request } from "@/lib/api";
import { absoluteDateTime } from "@/lib/format";
import { useSignIn } from "@/lib/signInDialog";
import type { AuditPage } from "@/lib/types";

const PAGE = 50;

interface Filters {
  kind: string;
  issueRef: string;
  actorRole: string;
  level: string;
  from: string;
  to: string;
}

const NO_FILTERS: Filters = { kind: "", issueRef: "", actorRole: "", level: "", from: "", to: "" };

function queryString(f: Filters, extra: Record<string, string | number> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) {
    if (v !== "" && v !== undefined) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * Audit log (blueprint 3.21), administrators only: every status transition,
 * escalation and moderation action, newest first, filterable, and exportable as
 * CSV. It is the screen that shows the audit trail is real -- it reads the same
 * append-only records the system itself writes, and offers no way to change one.
 */
export default function AuditLogPage() {
  const { session, initialising, authed } = useAuth();
  const { openSignIn } = useSignIn();
  const isAdmin = session?.role === "ADMIN";

  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [applied, setApplied] = useState<Filters>(NO_FILTERS);
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const page = useQuery({
    queryKey: ["admin", "audit", session?.userId, applied, offset],
    queryFn: () =>
      authed((token) =>
        request<AuditPage>(`/admin/audit${queryString(applied, { limit: PAGE, offset })}`, { token }),
      ),
    enabled: isAdmin,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await authed((token) =>
        fetch(`${apiBase()}/admin/audit.csv${queryString(applied)}`, { headers: { Authorization: `Bearer ${token}` } }),
      );
      if (!res.ok) throw new ApiError(res.status, null);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nagriksetu-audit-log.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("The export could not be downloaded. Try again in a moment.");
    } finally {
      setExporting(false);
    }
  }

  if (initialising) {
    return (
      <PageShell>
        <LoadingState label="Checking your session" />
      </PageShell>
    );
  }

  if (!session || !isAdmin) {
    return (
      <PageShell>
        <h1 className="text-display">Audit log</h1>
        <EmptyState
          message={
            session ? "The audit log is for administrators." : "Sign in with an administrator account to read the audit log."
          }
          {...(session ? {} : { actionLabel: "Sign in", onAction: openSignIn })}
        />
      </PageShell>
    );
  }

  const data = page.data;
  const from = data && data.total > 0 ? data.offset + 1 : 0;
  const to = data ? Math.min(data.offset + data.items.length, data.total) : 0;

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-end gap-4">
        <h1 className="text-display">Audit log</h1>
        <span className="ml-auto">
          <Button type="button" variant="secondary" onClick={() => void exportCsv()} disabled={exporting}>
            {exporting ? "Preparing…" : "Export CSV"}
          </Button>
        </span>
      </div>
      <p className="mt-1 text-dense text-ink-muted" style={{ maxWidth: "var(--measure-prose)" }}>
        Every status change, escalation and supervisor action, newest first. Read-only: nothing here can be edited.
      </p>

      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setApplied(draft);
        }}
      >
        <Select label="Kind" value={draft.kind} onChange={(v) => setDraft({ ...draft, kind: v })}
          options={[["", "Everything"], ["STATUS", "Status changes"], ["ESCALATION", "Escalations"], ["MODERATION", "Supervisor actions"]]} />
        <label className="flex flex-col gap-1 text-meta">
          Ticket
          <input value={draft.issueRef} onChange={(e) => setDraft({ ...draft, issueRef: e.target.value })}
            placeholder="CT-2026-000123" className="bg-surface-raised text-body text-ink border border-rule px-3 font-mono"
            style={{ minHeight: 40, borderRadius: "var(--radius)", width: 170 }} />
        </label>
        <Select label="Done by" value={draft.actorRole} onChange={(v) => setDraft({ ...draft, actorRole: v })}
          options={[["", "Anyone"], ["CITIZEN", "Citizen"], ["STAFF", "Crew"], ["SUPERVISOR", "Supervisor"], ["ADMIN", "Administrator"], ["SYSTEM", "The system"]]} />
        <Select label="Escalation level" value={draft.level} onChange={(v) => setDraft({ ...draft, level: v })}
          options={[["", "Any"], ["1", "Level 1"], ["2", "Level 2"], ["3", "Level 3"], ["4", "Level 4"]]} />
        <label className="flex flex-col gap-1 text-meta">
          From
          <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            className="bg-surface-raised text-body text-ink border border-rule px-3"
            style={{ minHeight: 40, borderRadius: "var(--radius)" }} />
        </label>
        <label className="flex flex-col gap-1 text-meta">
          To
          <input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            className="bg-surface-raised text-body text-ink border border-rule px-3"
            style={{ minHeight: 40, borderRadius: "var(--radius)" }} />
        </label>
        <Button type="submit">Apply</Button>
        <Button type="button" variant="secondary" onClick={() => { setDraft(NO_FILTERS); setApplied(NO_FILTERS); setOffset(0); }}>
          Clear
        </Button>
      </form>
      {exportError && (
        <p role="alert" className="mt-2 text-meta" style={{ color: "var(--st-breached)" }}>{exportError}</p>
      )}

      {page.isPending && <LoadingState label="Loading the audit log" />}
      {page.isError && (
        <ErrorState action="Loading the audit log" problem={(page.error as ApiError)?.problem} onRetry={() => void page.refetch()} />
      )}

      {data && (
        <>
          <p className="mt-4 text-meta text-ink-muted">
            {data.total === 0 ? "No entries match." : `${from.toLocaleString("en-IN")}–${to.toLocaleString("en-IN")} of ${data.total.toLocaleString("en-IN")} entries`}
          </p>
          {data.items.length > 0 && (
            <div className="audit-table mt-2 overflow-x-auto">
              <table className="w-full text-dense border-collapse">
                <caption className="sr-only">Audit log entries, newest first</caption>
                <thead>
                  <tr className="text-left text-meta text-ink-muted border-b border-rule-strong">
                    <th scope="col" className="py-2 pr-4 font-normal">When</th>
                    <th scope="col" className="py-2 pr-4 font-normal">Ticket</th>
                    <th scope="col" className="py-2 pr-4 font-normal">What happened</th>
                    <th scope="col" className="py-2 pr-4 font-normal">By</th>
                    <th scope="col" className="py-2 font-normal">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((e, i) => (
                    <tr key={`${e.at}-${e.kind}-${e.issueId}-${i}`} className="border-b border-rule align-top">
                      <td className="py-2 pr-4 whitespace-nowrap">{absoluteDateTime(e.at)}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <Link href={`/issues/${e.issueId}`} className="font-mono text-ink underline">{e.issueRef}</Link>
                        <span className="block text-meta text-ink-muted">{e.category}</span>
                      </td>
                      <td className="py-2 pr-4">
                        <span className="text-meta text-ink-muted uppercase tracking-wide">{kindWord(e.kind)}</span>
                        <span className="block">{e.action}</span>
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {e.actorName ?? roleWord(e.actorRole)}
                        {e.actorName && <span className="block text-meta text-ink-muted">{roleWord(e.actorRole)}</span>}
                      </td>
                      <td className="py-2 text-ink-muted">{e.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex items-center gap-3">
            <Button variant="secondary" disabled={offset === 0 || page.isFetching} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              Previous
            </Button>
            <Button variant="secondary" disabled={offset + PAGE >= data.total || page.isFetching} onClick={() => setOffset(offset + PAGE)}>
              Next
            </Button>
          </div>
        </>
      )}
    </PageShell>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-1 text-meta">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-surface-raised text-body text-ink border border-rule px-3"
        style={{ minHeight: 40, borderRadius: "var(--radius)" }}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

const kindWord = (k: string) => (k === "STATUS" ? "Status" : k === "ESCALATION" ? "Escalation" : "Supervisor action");
const roleWord = (r: string) =>
  ({ CITIZEN: "Citizen", STAFF: "Crew", SUPERVISOR: "Supervisor", ADMIN: "Administrator", SYSTEM: "The system" })[r] ?? r;
