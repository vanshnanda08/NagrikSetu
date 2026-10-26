"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { MeNav } from "@/components/MeNav";
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
 * password. No avatar. Email and role are shown but not editable: the email is
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
        <h1 className="text-display">Profile</h1>
        <EmptyState message="Sign in to see and change your profile." actionLabel="Sign in" onAction={openSignIn} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <MeNav current="/me/profile" />
      <EmailPreference />
      <h1 className="text-display">Profile</h1>
      {profile.isPending && <LoadingState label="Loading your profile" />}
      {profile.isError && (
        <ErrorState
          action="Loading your profile"
          problem={(profile.error as ApiError)?.problem}
          onRetry={() => void profile.refetch()}
        />
      )}
      {profile.data && (
        <div className="profile-grid mt-4 grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
          <ProfileForm profile={profile.data} />
          <PasswordForm />
        </div>
      )}
    </PageShell>
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
      className="flex flex-col gap-4"
    >
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

      <fieldset className="border-0 p-0 m-0">
        <legend className="text-meta mb-2">Tell me when</legend>
        <ul className="list-none p-0 m-0 flex flex-col gap-2">
          {(["VERIFY_REQUESTED", ...profile.mutableNotificationTypes] as NotificationType[]).map((t) => {
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

      <div className="flex flex-wrap items-center gap-3">
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

function PasswordForm() {
  const { authed } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [done, setDone] = useState(false);

  const change = useMutation({
    mutationFn: () =>
      authed((token) =>
        request<void>("/me/password", { method: "POST", token, body: { currentPassword: current, newPassword: next } }),
      ),
    onSuccess: () => {
      setDone(true);
      setCurrent("");
      setNext("");
      setAgain("");
    },
  });

  const tooShort = next.length > 0 && next.length < 10;
  const mismatch = again.length > 0 && again !== next;
  const ready = current.length > 0 && next.length >= 10 && next === again;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setDone(false);
        change.mutate();
      }}
      className="flex flex-col gap-4"
    >
      <h2 className="text-heading">Change password</h2>
      <label className="flex flex-col gap-1 text-meta">
        Current password
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)}
          className={FIELD} style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)" }} />
      </label>
      <label className="flex flex-col gap-1 text-meta">
        New password (at least 10 characters)
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)}
          aria-invalid={tooShort} className={FIELD} style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)" }} />
      </label>
      {tooShort && <p className="m-0 text-meta" style={{ color: "var(--st-breached)" }}>That is {next.length} characters; it needs at least 10.</p>}
      <label className="flex flex-col gap-1 text-meta">
        New password again
        <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)}
          aria-invalid={mismatch} className={FIELD} style={{ minHeight: "var(--hit-min)", borderRadius: "var(--radius)" }} />
      </label>
      {mismatch && <p className="m-0 text-meta" style={{ color: "var(--st-breached)" }}>The two passwords do not match.</p>}

      <p className="m-0 text-meta text-ink-muted">
        Changing your password revokes refresh sessions on every device. An already-issued access token can remain
        active for at most fifteen minutes.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!ready || change.isPending}>
          {change.isPending ? "Changing…" : "Change password"}
        </Button>
        {done && (
          <span role="status" className="text-dense">
            Password changed.
          </span>
        )}
      </div>
      {change.isError && <ErrorState action="Changing your password" problem={(change.error as ApiError)?.problem} />}
    </form>
  );
}
