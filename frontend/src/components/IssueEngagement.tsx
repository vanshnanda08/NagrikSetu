"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./Button";
import { ErrorState } from "./ErrorState";
import { useAuth } from "@/lib/auth";
import { request, ApiError } from "@/lib/api";
import { absoluteDateTime } from "@/lib/format";

interface Message { id: number; authorRole: string; kind: "REQUEST_INFO" | "CITIZEN_REPLY"; body: string; createdAt: string }

/** Authenticated engagement kept separate from the public issue projection. */
export function IssueEngagement({ issueId }: { issueId: string }) {
  const { session, authed } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const citizen = session?.role === "CITIZEN";

  const follow = useQuery({
    queryKey: ["issue", issueId, "follow", session?.userId],
    queryFn: () => authed((token) => request<{ following: boolean }>(`/issues/${issueId}/follow`, { token })),
    enabled: Boolean(session && citizen),
  });
  const toggleFollow = useMutation({
    mutationFn: (next: boolean) => authed((token) => request<void>(`/issues/${issueId}/follow`, { method: next ? "POST" : "DELETE", token })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["issue", issueId, "follow"] }),
  });
  const messages = useQuery({
    queryKey: ["issue", issueId, "messages", session?.userId],
    queryFn: () => authed((token) => request<Message[]>(`/issues/${issueId}/messages`, { token })),
    enabled: Boolean(session && !session.mfaSetupRequired),
    retry: false,
  });
  const post = useMutation({
    mutationFn: () => authed((token) => request<Message>(`/issues/${issueId}/messages`, { method: "POST", token, body: { body } })),
    onSuccess: () => { setBody(""); void qc.invalidateQueries({ queryKey: ["issue", issueId, "messages"] }); },
  });

  if (!session) return null;
  const denied = messages.error instanceof ApiError && messages.error.status === 403;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-heading">Updates and questions</h2>
        {citizen && follow.data && <span className="ml-auto">
          <Button type="button" variant="secondary" disabled={toggleFollow.isPending} onClick={() => toggleFollow.mutate(!follow.data.following)}>
            {follow.data.following ? "Stop following" : "Follow this issue"}
          </Button>
        </span>}
      </div>
      {citizen && <p className="mt-1 text-meta text-ink-muted">Following sends important status updates without adding another report or changing priority.</p>}
      {follow.isError && <ErrorState action="Loading follow status" problem={(follow.error as ApiError).problem} onRetry={() => void follow.refetch()} />}
      {toggleFollow.isError && <ErrorState action="Updating follow status" problem={(toggleFollow.error as ApiError).problem} />}
      {toggleFollow.isSuccess && <p role="status" className="text-meta mt-2">Follow preference saved.</p>}
      {!denied && messages.data && <>
        {messages.data.length === 0 ? <p className="mt-3 text-dense text-ink-muted">No clarification has been requested.</p> :
          <ol className="mt-3 list-none p-0 border-t border-rule">{messages.data.map((message) => <li key={message.id} className="py-3 border-b border-rule">
            <div className="flex flex-wrap gap-x-4 gap-y-1"><span className="text-meta font-semibold">{message.kind === "REQUEST_INFO" ? "Municipal staff" : "Citizen"}</span><span className="ml-auto text-meta text-ink-muted">{absoluteDateTime(message.createdAt)}</span></div>
            <p className="mt-1 text-dense whitespace-pre-wrap break-words">{message.body}</p>
          </li>)}</ol>}
        <form className="mt-4 flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); post.mutate(); }}>
          <p className="text-meta text-ink-muted">Visible to reporters of this issue and authorized municipal staff. Avoid sharing sensitive personal information.</p>
          <label className="text-meta" htmlFor="issue-message">{citizen ? "Reply to the department" : "Request information from reporters"}</label>
          <textarea id="issue-message" minLength={3} maxLength={2000} required value={body} onChange={(event) => setBody(event.target.value)} className="bg-surface-raised text-body text-ink border border-rule p-3 w-full" rows={3} style={{ borderRadius: "var(--radius)" }} />
          <span><Button type="submit" disabled={body.trim().length < 3 || post.isPending}>{post.isPending ? "Sending…" : "Send message"}</Button></span>
          {post.isError && <ErrorState action="Sending the message" problem={(post.error as ApiError).problem} />}
        </form>
      </>}
      {messages.isError && !denied && <ErrorState action="Loading clarification messages" problem={(messages.error as ApiError).problem} />}
    </section>
  );
}
