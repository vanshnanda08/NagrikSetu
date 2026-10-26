"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { request, type ApiError } from "@/lib/api";
import type { PublicIssue } from "@/lib/types";
import { Button } from "./Button";

/**
 * Look a ticket up by its reference (CT-2026-000123) and go to it. The 404 page
 * offers this because the commonest way to land there is a mistyped or
 * half-remembered reference, and the useful next step is to try another.
 */
export function TicketSearch() {
  const router = useRouter();
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    const wanted = ref.trim().toUpperCase();
    if (!wanted) return;
    setBusy(true);
    setProblem(null);
    try {
      const issue = await request<PublicIssue>(`/public/issues/by-ref/${encodeURIComponent(wanted)}`);
      router.push(`/issues/${issue.id}`);
    } catch (err) {
      setProblem(
        (err as ApiError).status === 404
          ? `No ticket with the reference ${wanted}. Check it against the one you were given.`
          : "The lookup could not be completed. Try again in a moment.",
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={find} className="mt-6 flex flex-col gap-2" style={{ maxWidth: 460 }} role="search">
      <label htmlFor="ticket-ref" className="text-meta">
        Ticket reference
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="ticket-ref"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="CT-2026-000123"
          autoComplete="off"
          className="flex-1 bg-surface-raised border border-rule px-3 text-body font-mono"
          style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)", minWidth: 200 }}
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Looking…" : "Find ticket"}
        </Button>
      </div>
      {problem && (
        <p role="alert" className="text-meta" style={{ color: "var(--st-breached)" }}>
          {problem}
        </p>
      )}
    </form>
  );
}
