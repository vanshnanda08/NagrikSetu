"use client";

import { useState } from "react";
import { Button } from "./Button";
import { usePwaInstall } from "@/lib/pwaInstall";

/** Optional install affordance; browsers without the event keep normal web access. */
export function PwaInstall() {
  const { prompt, installed, clearPrompt } = usePwaInstall();
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-heading">Install NagrikSetu</h2>
      <p className="text-dense text-ink-muted">
        Install the site for a home-screen icon and faster access to reporting and your offline outbox.
      </p>
      {installed ? (
        <p role="status" className="text-dense">Installed.</p>
      ) : prompt ? (
        <span><Button type="button" variant="secondary" disabled={opening} onClick={async () => {
          if (opening) return;
          setOpening(true);
          setError(null);
          try { await prompt.prompt(); await prompt.userChoice; }
          catch { setError("The install prompt could not open. Try your browser’s install command instead."); }
          finally { clearPrompt(); setOpening(false); }
        }}>{opening ? "Opening installation…" : "Install app"}</Button></span>
      ) : (
        <p className="text-meta text-ink-muted">Use your browser’s “Add to Home Screen” or “Install app” command when available.</p>
      )}
      {error && <p role="alert" className="text-dense">{error}</p>}
    </section>
  );
}
