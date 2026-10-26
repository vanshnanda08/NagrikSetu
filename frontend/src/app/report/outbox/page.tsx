"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/Button";
import { offlineStore, wakeOutbox, type OfflineJob } from "@/lib/offlineStore";

export default function OutboxPage() {
  const [jobs, setJobs] = useState<OfflineJob[]>([]);
  const [error, setError] = useState("");
  async function reload() {
    try { setJobs(await offlineStore<OfflineJob[]>("outbox", "all")); }
    catch { setError("Browser storage is unavailable."); }
  }
  useEffect(() => {
    void Promise.resolve().then(reload);
    const update = () => { void reload(); };
    navigator.serviceWorker?.addEventListener("message", update);
    return () => navigator.serviceWorker?.removeEventListener("message", update);
  }, []);
  return <PageShell>
    <h1 className="text-display">Report outbox</h1>
    <p className="mt-3 text-body">Queued reports and photos stay on this device until sent or removed. Background delivery depends on browser support; otherwise reopen this app when online. Signed-in reports require their original account.</p>
    <Link href="/report" className="underline block mt-4">Back to reporting</Link>
    {error && <p role="alert">{error}</p>}
    {!jobs.length && <p className="mt-4">No queued reports on this device.</p>}
    <ul className="mt-4 grid gap-4">{jobs.map(job => <li key={job.id} className="border border-rule p-4">
      <h2 className="text-heading">{job.state === "sent" ? "Sent" : job.state === "failed" ? "Needs attention" : "Waiting to send"}</h2>
      <p>{new Date(job.createdAt).toLocaleString()} — {job.message ?? "Saved safely on this device."}</p>
      {job.publicRef && <Link className="underline" href={`/report/success/${job.publicRef}`}>{job.publicRef}</Link>}
      <div className="flex gap-3 mt-3">
        {job.state !== "sent" && <Button onClick={async () => {
          try { await offlineStore("outbox", "put",job.id,{ ...job,state:"pending",nextAttempt:0 }); await wakeOutbox(); await reload(); }
          catch(e) { setError(e instanceof Error ? e.message : "Could not retry."); }
        }}>Retry now</Button>}
        <Button variant="secondary" onClick={async () => {
          if (!confirm("Remove this local outbox entry? A report already being sent may still arrive.")) return;
          // Coordinate with the worker so an in-flight write cannot resurrect a deleted job.
          const remove = async () => { await offlineStore("outbox","delete",job.id); await reload(); };
          try { if (navigator.locks) await navigator.locks.request("ct-report-outbox",remove); else await remove(); }
          catch { setError("Could not remove the entry."); }
        }}>Remove</Button>
      </div>
    </li>)}</ul>
  </PageShell>;
}
