"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { ACCOUNT_VIEWS } from "@/lib/navigation";
import { EmailPreference } from "@/components/EmailPreference";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { useAuth } from "@/lib/auth";
import { request, type ApiError } from "@/lib/api";
import { useSignIn } from "@/lib/signInDialog";
import type { NotificationType, Profile } from "@/lib/types";

const TYPE_COPY: Record<NotificationType, { title: string; detail: string }> = {
  VERIFY_REQUESTED: {
    title: "A fix needs your answer",
    detail: "Always on. If nobody answers, the fix counts as confirmed after the deadline, so this cannot be switched off.",
  },
  RESOLVED: { title: "A report of yours was resolved", detail: "When a fix is confirmed, or closes after the answer period." },
  CLOSED: { title: "An administrator closed a complaint", detail: "Includes the closure reason. Early closure does not mean the repair was verified." },
  REOPENED: { title: "A fix did not hold", detail: "When a report of yours is reopened because the problem came back." },
  REJECTED: {
    title: "A report was turned down or joined",
    detail: "When a supervisor rejects an issue you reported, or joins it with another report of the same problem.",
  },
  INFO_REQUESTED: {
    title: "The department needs more information",
    detail: "When staff ask a question about a problem you reported.",
  },
  CITIZEN_REPLIED: {
    title: "A citizen answered a question",
    detail: "For municipal accounts working on an issue.",
  },
};

const FIELD =
  "bg-surface-raised text-body text-ink border border-rule px-3 w-full";

/**
 * Profile (blueprint 3.13): display name, contact, notification preferences and
 * contact details. No avatar. Email is shown but not editable: the email is
 * the login, and role and department are the organisation's decision.
 */
export default function ProfilePage() {
  const { session, initialising, authed } = useAuth();
  const { openSignIn } = useSignIn();

  const profile = useQuery({
    queryKey: ["me", "profile", session?.userId],
    queryFn: () => authed((token) => request<Profile>("/me/profile", { token })),
    enabled: Boolean(session),
    staleTime: 60_000,
  });

  if (initialising) {
    return (
      <PageShell>
        <LoadingState label="Checking your session" />
      </PageShell>
    );
  }

  if (!session) {
    return (
      <PageShell>
        <h1 className="text-display">Account settings</h1>
        <EmptyState message="Sign in to see and change your profile." actionLabel="Sign in" onAction={openSignIn} />
      </PageShell>
    );
  }

  return (
    <WorkspaceShell title="Account settings" links={ACCOUNT_VIEWS} current="/me/settings">
      <p className="page-description mt-2 text-dense">Manage your contact details and notification preferences.</p>
      {profile.isPending && <LoadingState label="Loading your profile" />}
      {profile.isError && (
        <ErrorState
          action="Loading your profile"
          problem={(profile.error as ApiError)?.problem}
          onRetry={() => void profile.refetch()}
        />
      )}
      <div className="workspace-scroll" tabIndex={0} role="region" aria-label="Profile and notification preferences">
      {profile.data && (
        <div className="profile-grid mt-4 grid grid-cols-1 gap-x-12 gap-y-8">
          <ProfileForm profile={profile.data} />
        </div>
      )}
      <EmailPreference />
      </div>
    </WorkspaceShell>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const { authed, session } = useAuth();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(profile.fullName);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [muted, setMuted] = useState<NotificationType[]>(profile.mutedNotificationTypes);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      authed((token) =>
        request<Profile>("/me/profile", {
          method: "PUT",
          token,
          body: { fullName: fullName.trim(), phone: phone.trim() || null, mutedNotificationTypes: muted },
        }),
      ),
    onSuccess: (p) => {
      qc.setQueryData(["me", "profile", session?.userId], p);
      setSaved(true);
    },
  });

  function toggle(t: NotificationType) {
    setSaved(false);
    setMuted((m) => (m.includes(t) ? m.filter((x) => x !== t) : [...m, t]));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        save.mutate();
      }}
      className="profile-settings-form"
    >
      <div className="profile-contact">
      <h2 className="text-heading">About you</h2>

      <label className="flex flex-col gap-1 text-meta">
        Name
        <input
          value={fullName}
          onChange={(e) => {
            setSaved(false);
            setFullName(e.target.value);
          }}
          maxLength={160}
          required
          className={FIELD}
          style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)" }}
        />
      </label>

      <div className="flex flex-col gap-1 text-meta">
        Email
        <p className="text-body m-0">{profile.email ?? "None"}</p>
        <p className="m-0 text-ink-muted">Your email is how you sign in, so it cannot be changed here.</p>
      </div>

      <label className="flex flex-col gap-1 text-meta">
        Phone (optional)
        <input
          value={phone}
          onChange={(e) => {
            setSaved(false);
            setPhone(e.target.value);
          }}
          inputMode="tel"
          maxLength={20}
          placeholder="9876543210"
          className={FIELD}
          style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)" }}
        />
      </label>

      </div>
      <fieldset className="profile-preferences border-0 p-0 m-0">
        <legend className="text-meta mb-2">Tell me when</legend>
        <ul className="list-none p-0 m-0 flex flex-col gap-2">
          {(["VERIFY_REQUESTED", ...profile.mutableNotificationTypes.filter(type => type !== "CITIZEN_REPLIED" || session?.role !== "CITIZEN")] as NotificationType[]).map((t) => {
            const fixed = !profile.mutableNotificationTypes.includes(t);
            return (
              <li key={t}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fixed ? true : !muted.includes(t)}
                    disabled={fixed}
                    onChange={() => toggle(t)}
                    className="mt-1"
                    style={{ width: 20, height: 20 }}
                  />
                  <span>
                    <span className="text-body">{TYPE_COPY[t].title}</span>
                    <span className="block text-meta text-ink-muted">{TYPE_COPY[t].detail}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="profile-save-actions flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={save.isPending || fullName.trim().length === 0}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
        {saved && (
          <span role="status" className="text-dense">
            Saved.
          </span>
        )}
      </div>
      {save.isError && <ErrorState action="Saving your profile" problem={(save.error as ApiError)?.problem} />}
    </form>
  );
}

