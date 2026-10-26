"use client";

/**
 * Last resort: the root layout itself failed, so there are no providers, no
 * stylesheet-dependent chrome and no composer state to promise anything about.
 * This replaces the whole document, so it must bring its own <html> and <body>.
 * It stays honest: the held report lives in memory above the layout, and a
 * failure at this level may have discarded it.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "48px 24px", background: "#eaf3fa", color: "#0b2540" }}>
        <main style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1 style={{ fontSize: 32, margin: "0 0 12px" }}>Something went wrong</h1>
          <p style={{ fontSize: 17, lineHeight: 1.5 }}>
            The application failed to start. Reloading usually fixes it. If you were in the middle of a report,
            it may need to be started again.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ marginTop: 16, padding: "12px 24px", borderRadius: 999, border: 0, background: "#0b3b5e", color: "#fff", fontSize: 16, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
