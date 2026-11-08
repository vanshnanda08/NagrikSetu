import { ApiError } from "./api";

export interface AuthenticatedSession { accessToken: string; userId: string }
export type AuthenticatedRequest = <T>(run: (token: string) => Promise<T>, expectedUserId?: string) => Promise<T>;

/** One retry after expiry; identity-bound writes must never switch accounts. */
export async function runAuthenticated<T>(session: AuthenticatedSession | null,
  refresh: () => Promise<AuthenticatedSession | null>, run: (token: string) => Promise<T>, expectedUserId?: string): Promise<T> {
  const requireIdentity = (current: AuthenticatedSession | null) => {
    if (!current) throw new ApiError(401, { detail: expectedUserId
      ? "Your original session could not be renewed. Sign in to the account that started this report, then retry."
      : "Sign in to see this." });
    if (expectedUserId && current.userId !== expectedUserId) throw new ApiError(409, {
      detail: "This report belongs to another account. Sign in to its original account, then retry.",
    });
    return current;
  };
  const current = requireIdentity(session ?? await refresh());
  try { return await run(current.accessToken); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const renewed = requireIdentity(await refresh());
    return run(renewed.accessToken);
  }
}
