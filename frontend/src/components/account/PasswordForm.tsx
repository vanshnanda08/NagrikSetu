"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { useAuth } from "@/lib/auth";
import { request, type ApiError } from "@/lib/api";
const FIELD = "bg-surface-raised text-body text-ink border border-rule px-3 w-full";

export function PasswordForm() {
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
      aria-label="Change password"
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

      <div className="password-save-actions flex flex-wrap items-center gap-3">
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
