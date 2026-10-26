"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { MeNav } from "@/components/MeNav";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PwaInstall } from "@/components/PwaInstall";
import { useAuth } from "@/lib/auth";
import { request, type ApiError } from "@/lib/api";
import { absoluteDateTime, ageLabel } from "@/lib/format";
import { useSignIn } from "@/lib/signInDialog";

interface SecurityStatus { mfaEnabled: boolean; mfaRequired: boolean; recoveryCodesRemaining: number }
interface Setup { secret: string; provisioningUri: string }
interface SessionView { familyId: string; createdAt: string; lastUsedAt: string; expiresAt: string; revoked: boolean; current: boolean }

const FIELD = "bg-surface-raised text-body text-ink border border-rule px-3 w-full";

export default function SecurityPage() {
  const { session, initialising, authed } = useAuth();
  const { openSignIn } = useSignIn();
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);

  const status = useQuery({ queryKey: ["me", "security", session?.userId], queryFn: () => authed((token) => request<SecurityStatus>("/me/security", { token })), enabled: Boolean(session) });
  const sessions = useQuery({ queryKey: ["me", "sessions", session?.userId], queryFn: () => authed((token) => request<SessionView[]>("/me/security/sessions", { token })), enabled: Boolean(session) });
  const begin = useMutation({
    mutationFn: () => authed((token) => request<Setup>("/me/security/mfa/setup", { method: "POST", token, body: { currentPassword: password } })),
    onSuccess: (value) => { setSetup(value); setRecovery(null); setPassword(""); },
  });
  const enable = useMutation({
    mutationFn: () => authed((token) => request<{ recoveryCodes: string[] }>("/me/security/mfa/enable", { method: "POST", token, body: { code } })),
    onSuccess: (value) => { setRecovery(value.recoveryCodes); setSetup(null); setCode(""); void qc.invalidateQueries({ queryKey: ["me", "security"] }); },
  });
  const revoke = useMutation({
    mutationFn: (familyId: string) => authed((token) => request(`/me/security/sessions/${familyId}`, { method: "DELETE", token })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["me", "sessions"] }),
  });
  const revokeOthers = useMutation({
    mutationFn: () => authed((token) => request("/me/security/sessions/revoke-others", { method: "POST", token })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["me", "sessions"] }),
  });

  if (initialising) return <PageShell><LoadingState label="Checking your session" /></PageShell>;
  if (!session) return <PageShell><h1 className="text-display">Security</h1><EmptyState message="Sign in to manage account security." actionLabel="Sign in" onAction={openSignIn} /></PageShell>;

  return (
    <PageShell>
      <MeNav current="/me/security" />
      <h1 className="text-display">Security</h1>
      {status.isPending && <LoadingState label="Loading security settings" />}
      {status.isError && <ErrorState action="Loading security settings" problem={(status.error as ApiError).problem} />}
      {status.data && <div className="mt-5 flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-heading">Authenticator</h2>
          <p className="text-dense text-ink-muted">
            {status.data.mfaEnabled
              ? `Enabled. ${status.data.recoveryCodesRemaining} unused recovery codes remain.`
              : status.data.mfaRequired ? "Required before municipal tools can be used." : "Optional extra protection for this account."}
          </p>
          {!status.data.mfaEnabled && !setup && !recovery && <>
            <label className="flex flex-col gap-1 text-meta">Current password
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={FIELD} style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)" }} />
            </label>
            <span><Button type="button" disabled={!password || begin.isPending} onClick={() => begin.mutate()}>{begin.isPending ? "Starting…" : "Set up authenticator"}</Button></span>
            {begin.isError && <ErrorState action="Starting authenticator setup" problem={(begin.error as ApiError).problem} />}
          </>}
          {setup && <div className="border border-rule p-4 flex flex-col gap-3" style={{ borderRadius: "var(--radius)" }}>
            <p className="text-dense">Add this key to any TOTP authenticator:</p>
            <code className="text-ref break-all select-all">{setup.secret}</code>
            <details><summary className="text-meta cursor-pointer">Provisioning URI</summary><code className="text-ref break-all select-all">{setup.provisioningUri}</code></details>
            <label className="flex flex-col gap-1 text-meta">Six-digit code
              <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" value={code} onChange={(e) => setCode(e.target.value)} className={FIELD} style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)" }} />
            </label>
            <span><Button type="button" disabled={!/^\d{6}$/.test(code) || enable.isPending} onClick={() => enable.mutate()}>Confirm and enable</Button></span>
            {enable.isError && <ErrorState action="Enabling multi-factor authentication" problem={(enable.error as ApiError).problem} />}
          </div>}
          {recovery && <div role="status" className="border border-rule p-4" style={{ borderRadius: "var(--radius)" }}>
            <h3 className="text-body font-semibold">Save these recovery codes now</h3>
            <p className="text-meta text-ink-muted">Each works once. They are not shown again.</p>
            <ul className="grid grid-cols-2 gap-1 mt-3 font-mono text-ref">{recovery.map((item) => <li key={item}>{item}</li>)}</ul>
            <p className="mt-3 text-dense">Setup is complete and existing refresh sessions have been revoked. Save these codes, then sign out and sign in with the next authenticator code.</p>
          </div>}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3"><h2 className="text-heading">Signed-in devices</h2><span className="ml-auto"><Button type="button" variant="secondary" onClick={() => revokeOthers.mutate()} disabled={revokeOthers.isPending}>Sign out other devices</Button></span></div>
          {sessions.isPending && <LoadingState label="Loading sessions" />}
          <p className="text-meta text-ink-muted">Signing out a device prevents session renewal. An existing access token may remain valid for up to 15 minutes.</p>
          {sessions.isError && <ErrorState action="Loading sessions" problem={(sessions.error as ApiError).problem} onRetry={() => void sessions.refetch()} />}
          {revoke.isError && <ErrorState action="Signing out the device" problem={(revoke.error as ApiError).problem} />}
          {revokeOthers.isError && <ErrorState action="Signing out other devices" problem={(revokeOthers.error as ApiError).problem} />}
          {(revoke.isSuccess || revokeOthers.isSuccess) && <p role="status" className="text-meta">Session access updated.</p>}
          {sessions.data && <ul className="list-none p-0 border-t border-rule">{sessions.data.filter((item) => !item.revoked).map((item) => <li key={item.familyId} className="py-3 border-b border-rule flex gap-3 items-center">
            <span><span className="text-body">{item.current ? "This device" : "Another signed-in device"}</span><span className="block text-meta text-ink-muted">Last used {ageLabel(item.lastUsedAt)} · expires {absoluteDateTime(item.expiresAt)}</span></span>
            {!item.current && <span className="ml-auto"><Button type="button" variant="secondary" disabled={revoke.isPending} onClick={() => revoke.mutate(item.familyId)}>Sign out</Button></span>}
          </li>)}</ul>}
        </section>
        <PwaInstall />
      </div>}
    </PageShell>
  );
}
