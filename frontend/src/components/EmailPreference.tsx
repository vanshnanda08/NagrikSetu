"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { request } from "@/lib/api";

export function EmailPreference() {
  const { session, authed } = useAuth();
  const cache = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const key = ["email-preferences", session?.userId];
  const preference = useQuery({ queryKey: key, enabled: !!session,
    queryFn: () => authed(token => request<{ enabled: boolean }>("/me/email-preferences", { token })) });
  return <section className="mt-6 border-t border-rule pt-4">
    <h2 className="text-heading">Email notifications</h2>
    <p className="text-body mt-2">Receive issue updates by email as well as in the app. Delivery requires the municipal mail service to be configured.</p>
    <label className="flex gap-3 items-center mt-3 text-body">
      <input type="checkbox" checked={preference.data?.enabled ?? false} disabled={!preference.data || busy}
        onChange={async event => {
          const enabled = event.target.checked;
          const previous = preference.data;
          setBusy(true); setError("");
          cache.setQueryData(key, { enabled });
          try {
            await authed(token => request("/me/email-preferences", { token, method: "PUT", body: { enabled } }));
            cache.setQueryData(key, { enabled });
          } catch (e) { cache.setQueryData(key, previous); setError(e instanceof Error ? e.message : "Could not save preference."); }
          finally { setBusy(false); }
        }} /> Email me issue updates
    </label>
    {(error || preference.isError) && <p role="alert">{error || "Could not load email preference. Reload to retry."}</p>}
  </section>;
}
