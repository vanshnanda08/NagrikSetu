"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { useAuth } from "@/lib/auth";
import { ApiError, request } from "@/lib/api";
import { invalidateAfterModeration } from "@/lib/moderation";
import type { Member } from "@/lib/types";

export function AssigneePicker({ issueId, departmentId }: { issueId: string; departmentId: string }) {
  const { authed, session } = useAuth();
  const qc = useQueryClient();
  const [assignee, setAssignee] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const members = useQuery({
    queryKey: ["supervisor", "members", departmentId, issueId, session?.userId],
    queryFn: () => authed((token) => request<Member[]>(`/supervisor/departments/${departmentId}/members?issueId=${issueId}`, { token })),
    staleTime: 30_000,
  });

  const assign = useMutation({
    mutationFn: () =>
      authed((token) =>
        request(`/issues/${issueId}/assign`, {
          method: "POST",
          token,
          body: { assigneeId: assignee, note: note.trim() || undefined },
        }),
      ),
    onSuccess: () => {
      invalidateAfterModeration(qc);
    },
  });

  return (
    <div className="assignee-picker mt-4" style={{ maxWidth: 560 }}>
      {members.isPending && <LoadingState label="Loading the department" />}
      {members.isError && <ErrorState action="Loading the department" problem={(members.error as ApiError)?.problem} onRetry={() => void members.refetch()} />}
      {members.data && members.data.length === 0 && (
        <p className="text-dense">Nobody in this department can be assigned work yet.</p>
      )}
      {members.data && members.data.length > 0 && (
        <fieldset className="border-0 p-0 m-0">
          <legend className="text-meta text-ink-muted mb-1">Assign to</legend>
          <ul className="list-none p-0 m-0 border-t border-rule">
            {members.data.map((m) => (
              <li key={m.id} className="border-b border-rule">
                <label className="flex items-center gap-3 py-2 cursor-pointer" style={{ minHeight: "var(--hit-min)" }}>
                  <input
                    type="radio"
                    name={`assignee-${issueId}`}
                    className="w-5 h-5"
                    checked={assignee === m.id}
                    onChange={() => setAssignee(m.id)}
                  />
                  <span className="text-dense">{m.fullName}</span>
                  <span className="text-meta text-ink-muted">
                    {m.role === "SUPERVISOR" ? "supervisor" : "crew"}
                    {m.wardName ? ` · ${m.wardName}` : ""} · holding {m.openAssigned}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <div className="mt-3">
        <TextField label="Note (optional)" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="work-action-footer mt-3">
        <Button disabled={!members.data?.some(member => member.id === assignee) || members.isFetching || assign.isPending} onClick={() => assign.mutate()}>
          {assign.isPending ? "Assigning…" : "Assign"}
        </Button>
      </div>
      {assign.isError && <ErrorState action="Assigning" problem={(assign.error as ApiError)?.problem} />}
    </div>
  );
}
