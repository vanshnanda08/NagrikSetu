import { request } from "./api";
import type { AuthenticatedRequest } from "./authenticatedRequest";
import type { ClusterResult } from "./types";

/** Online retries share the same payload, submission key and original owner. */
export function submitReport(body: Record<string, unknown>, id: string, ownerId: string | null, authed: AuthenticatedRequest) {
  const send = (token?: string) => request<ClusterResult>("/reports", {
    method: "POST", token, headers: { "Idempotency-Key": id }, body,
  });
  return ownerId ? authed(send, ownerId) : send();
}
