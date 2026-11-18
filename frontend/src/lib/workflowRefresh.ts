import { ApiError } from "./api";

export const WORKFLOW_REFRESH_MS = 15_000;

/** Refresh mounted workflow data without reloading pages or resetting drafts. */
export const workflowRefresh = {
  refetchInterval: (query: { state: { error: Error | null } }) => {
    const error = query.state.error;
    // Do not repeatedly request a ticket or private resource that is unavailable
    // to this account. Explicit retry/focus/reconnect can still recover it.
    if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return false;
    return WORKFLOW_REFRESH_MS;
  },
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: "always",
  refetchOnReconnect: "always",
} as const;
