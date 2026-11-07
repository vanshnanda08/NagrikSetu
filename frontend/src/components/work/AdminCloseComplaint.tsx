"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/Button";
import { ErrorState } from "@/components/ErrorState";
import { useAuth } from "@/lib/auth";
import { request, type ApiError } from "@/lib/api";
import { validClosureReason, MIN_CLOSURE_REASON, MAX_CLOSURE_REASON } from "@/lib/adminClosure";
import type { IssueStatus } from "@/lib/status";
import { invalidateAfterModeration } from "@/lib/moderation";

/** Administrator-only action; the API independently enforces role, state and reason. */
export function AdminCloseComplaint({ issueId, publicRef, status, onClosed }: { issueId: string; publicRef: string; status: IssueStatus; onClosed: () => void }) {
  const early = status !== "RESOLVED";
  const { authed } = useAuth();
  const qc = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const close = useMutation({
    mutationFn: () => authed(token => request(`/issues/${issueId}/close`, { method: "POST", token, body: { note: reason.trim() } })),
    onSuccess: () => {
      dialog.current?.close();
      onClosed();
      invalidateAfterModeration(qc);
      void qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });
  return <section className="mt-4 border-t border-rule pt-4" aria-label="Administrator closure">
    <h3 className="text-heading">{early ? "Close before resolution" : "Close resolved complaint"}</h3>
    <p className="mt-2 text-dense text-ink-muted">{early ? "Administrative closure stops work and any pending verification. It does not record a resolved or verified repair." : "Closing ends the automatic reopening window."} Future reports start a new complaint. Your reason stays in the public history and audit log, and reporters and followers are notified according to their preferences.</p>
    <label className="mt-3 flex flex-col gap-1 text-meta">
      Closure reason (at least 20 characters)
      <textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} minLength={MIN_CLOSURE_REASON} maxLength={MAX_CLOSURE_REASON} required disabled={close.isPending} className="border border-rule bg-surface-raised px-3 py-2 text-body" />
    </label>
    <div className="work-action-footer mt-3"><Button disabled={!validClosureReason(reason) || close.isPending || close.isSuccess} onClick={() => { close.reset(); dialog.current?.showModal(); }}>Close complaint</Button></div>
    <dialog ref={dialog} className="ct-dialog closure-dialog" aria-labelledby={`close-title-${issueId}`} onCancel={event => { if (close.isPending) event.preventDefault(); }}>
      <div className="auth-panel">
        <h2 id={`close-title-${issueId}`} className="text-heading">Close {publicRef}?</h2>
        <p className="mt-3 text-dense">{early ? "This complaint has not been resolved. Closing it stops work and any pending verification. It will be recorded as closed before resolution, not as a successful repair." : "This complaint is resolved. Closing it now ends its remaining reopening window."}</p>
        <div className="closure-dialog-reason mt-3" tabIndex={0} role="region" aria-label="Closure reason to confirm"><p className="text-dense"><strong>Reason:</strong> {reason.trim()}</p></div>
        {close.isError && <ErrorState action="Closing this complaint" problem={(close.error as ApiError)?.problem} />}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" disabled={close.isPending} onClick={() => dialog.current?.close()}>Cancel</Button>
          <Button disabled={close.isPending} onClick={() => close.mutate()}>{close.isPending ? "Closing…" : "Confirm closure"}</Button>
        </div>
      </div>
    </dialog>
  </section>;
}
