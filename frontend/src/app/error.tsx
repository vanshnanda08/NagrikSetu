"use client";

import { useEffect } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/Button";

/**
 * The 500 screen (blueprint §3.22). Something failed while rendering a page.
 * It says so plainly, says the one thing a citizen most needs to know -- a
 * report being composed was not lost, because it is held above the page in the
 * ComposerProvider, which an error here does not unmount -- and offers a retry.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The console is the only place a stack trace belongs; the page shows none.
    console.error(error);
  }, [error]);

  return (
    <PageShell>
      <h1 className="text-display">Something went wrong</h1>
      <p className="mt-3 text-body" style={{ maxWidth: "var(--measure-prose)" }}>
        This page failed to load. That is a fault on our side, not something you did. If you were
        composing a report, it has not been lost: your photo and details are still held, and you can
        carry on from the report page.
      </p>
      <p className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Link href="/report" className="text-body underline text-ink">
          Back to your report
        </Link>
        <Link href="/dashboard" className="text-body underline text-ink">
          Dashboard
        </Link>
      </p>
      {error.digest && (
        <p className="mt-6 text-meta text-ink-muted">Reference for support: {error.digest}</p>
      )}
    </PageShell>
  );
}
