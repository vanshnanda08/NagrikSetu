"use client";

import Link from "next/link";
import { useState } from "react";
import { PageShell } from "./PageShell";
import { Button } from "./Button";
import { request } from "@/lib/api";

export function RecoveryForm({ reset = false }: { reset?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  return <PageShell>
    <h1 className="text-display">{reset ? "Choose a new password" : "Reset your password"}</h1>
    <p className="mt-3 text-body">{reset ? "Reset links expire after 30 minutes and work once." : "Enter your account email. If it is active, we will email a reset link."}</p>
    {!done && <form className="mt-6 grid gap-4 max-w-md" onSubmit={async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      setBusy(true); setMessage("");
      try {
        const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
        if (reset && !token) throw new Error("This link is missing its reset token. Request a new link.");
        await request(`/auth/${reset ? "reset-password" : "forgot-password"}`, {
          method: "POST", body: reset ? { token, password: data.get("password") } : { email: data.get("email") },
        });
        if (reset) history.replaceState(null, "", window.location.pathname);
        setDone(true);
        setMessage(reset ? "Password changed. Sign in with your new password." : "If that account is active, a reset link will be emailed to it.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
      finally { setBusy(false); }
    }}>
      <label className="grid gap-2 text-body">{reset ? "New password" : "Email"}
        <input className="border border-rule p-3 bg-surface-raised" name={reset ? "password" : "email"}
          type={reset ? "password" : "email"} autoComplete={reset ? "new-password" : "email"}
          minLength={reset ? 10 : undefined} maxLength={reset ? 72 : 180} required />
      </label>
      <Button disabled={busy} type="submit">{busy ? "Please wait…" : reset ? "Save password" : "Email reset link"}</Button>
    </form>}
    {message && <p role="status" className="mt-4 text-body">{message}</p>}
    <p className="mt-4"><Link className="underline" href={reset && !done ? "/forgot-password" : "/login"}>{reset && !done ? "Request a new link" : "Back to sign in"}</Link></p>
  </PageShell>;
}
