"use client";

import { useEffect, useState } from "react";
import { Button } from "./Button";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Optional install affordance; browsers without the event keep normal web access. */
export function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const ready = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const done = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", done);
    };
  }, []);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-heading">Install NagrikSetu</h2>
      <p className="text-dense text-ink-muted">
        Install the site for a home-screen icon and faster access to reporting and your offline outbox.
      </p>
      {installed ? (
        <p role="status" className="text-dense">Installed.</p>
      ) : prompt ? (
        <span><Button type="button" variant="secondary" onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }}>Install app</Button></span>
      ) : (
        <p className="text-meta text-ink-muted">Use your browser’s “Add to Home Screen” or “Install app” command when available.</p>
      )}
    </section>
  );
}
