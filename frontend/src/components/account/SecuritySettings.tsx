"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { PasswordForm } from "./PasswordForm";
import { ACCOUNT_VIEWS } from "@/lib/navigation";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PwaInstall } from "@/components/PwaInstall";
import { useAuth } from "@/lib/auth";
import { request, type ApiError } from "@/lib/api";
import { absoluteDateTime, timeAgo } from "@/lib/format";
import { useSignIn } from "@/lib/signInDialog";

interface SessionView { familyId: string; createdAt: string; lastUsedAt: string; expiresAt: string; revoked: boolean; current: boolean }

export default function SecurityPage() {
  const { session, initialising, authed } = useAuth();
  const { openSignIn } = useSignIn();
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ["me", "sessions", session?.userId], queryFn: () => authed((token) => request<SessionView[]>("/me/security/sessions", { token })), enabled: Boolean(session) });
  const revoke = useMutation({
    mutationFn: (familyId: string) => authed((token) => request(`/me/security/sessions/${familyId}`, { method: "DELETE", token })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["me", "sessions"] }),
  });
  const revokeOthers = useMutation({
    mutationFn: () => authed((token) => request("/me/security/sessions/revoke-others", { method: "POST", token })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["me", "sessions"] }),
  });

  if (initialising) return <PageShell><LoadingState label="Checking your session" /></PageShell>;
  if (!session) return <PageShell><h1 className="text-display">Account settings</h1><EmptyState message="Sign in to manage account security." actionLabel="Sign in" onAction={openSignIn} /></PageShell>;

  return (
    <WorkspaceShell title="Account settings" links={ACCOUNT_VIEWS} current="/me/settings?tab=security" className="security-page">
      <p className="page-description mt-2 text-dense">Manage your password and signed-in devices.</p>
      <div className="workspace-scroll security-grid" tabIndex={0} role="region" aria-label="Account security settings">
      <div className="profile-grid mb-6"><PasswordForm /></div>
      <div className="security-options">
        <div className="security-devices-panel" role="region" aria-labelledby="security-devices-heading" tabIndex={0}>
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3"><h2 id="security-devices-heading" className="text-heading">Signed-in devices</h2><span className="ml-auto"><Button type="button" variant="secondary" onClick={() => revokeOthers.mutate()} disabled={revokeOthers.isPending}>Sign out other devices</Button></span></div>
          {sessions.isPending && <LoadingState label="Loading sessions" />}
          <p className="text-meta text-ink-muted">Signing out a device prevents session renewal. An existing access token may remain valid for up to 15 minutes.</p>
          {sessions.isError && <ErrorState action="Loading sessions" problem={(sessions.error as ApiError).problem} onRetry={() => void sessions.refetch()} />}
          {revoke.isError && <ErrorState action="Signing out the device" problem={(revoke.error as ApiError).problem} />}
          {revokeOthers.isError && <ErrorState action="Signing out other devices" problem={(revokeOthers.error as ApiError).problem} />}
          {(revoke.isSuccess || revokeOthers.isSuccess) && <p role="status" className="text-meta">Session access updated.</p>}
          {sessions.data && <ul className="list-none p-0 border-t border-rule">{sessions.data.filter((item) => !item.revoked).map((item) => <li key={item.familyId} className="security-device py-3 border-b border-rule flex gap-3 items-center">
            <span><span className="text-body">{item.current ? "This device" : "Another signed-in device"}</span><span className="block text-meta text-ink-muted">Last used {timeAgo(item.lastUsedAt)} · expires {absoluteDateTime(item.expiresAt)}</span></span>
            {!item.current && <span className="ml-auto"><Button type="button" variant="secondary" disabled={revoke.isPending} onClick={() => revoke.mutate(item.familyId)}>Sign out</Button></span>}
          </li>)}</ul>}
        </section>
        <details className="security-install"><summary>Install the app</summary><PwaInstall /></details>
        </div>
      </div>
      </div>
    </WorkspaceShell>
  );
}
