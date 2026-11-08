"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "./api";
import { runAuthenticated, type AuthenticatedRequest } from "./authenticatedRequest";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Authentication.
 *
 * The access token lives HERE -- in React state, in memory, for the life of the
 * tab -- and nowhere else. Blueprint §6 rules out localStorage and
 * sessionStorage, and the reason is that both are readable by any injected
 * script. The refresh token is in an httpOnly cookie that this code cannot
 * read even if it wanted to, set by the route handlers under /api/auth.
 *
 * The cost of that choice is one silent refresh on every page load, which is
 * what `useEffect` below does. That is a real cost and it is the right trade:
 * a reload that takes one extra round trip is better than a token that survives
 * in a store an attacker can read.
 */

export type Role = "CITIZEN" | "STAFF" | "SUPERVISOR" | "ADMIN";

export interface Session {
  accessToken: string;
  userId: string;
  fullName: string;
  role: Role;
  mfaSetupRequired?: boolean;
}

interface AuthValue {
  session: Session | null;
  /** True until the first silent refresh settles, so guards do not flash. */
  initialising: boolean;
  signIn: (email: string, password: string, mfaCode?: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
  /** Runs a request with the access token, refreshing once on a 401. */
  authed: AuthenticatedRequest;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [initialising, setInitialising] = useState(true);

  // A single in-flight refresh, shared. Without this, a page that fires four
  // authenticated queries at once and gets four 401s would start four
  // refreshes, and each rotates the cookie -- so three of them would present a
  // token the server has already replaced.
  const refreshInFlight = useRef<Promise<Session | null> | null>(null);

  const refresh = useCallback(async (): Promise<Session | null> => {
    if (refreshInFlight.current) return refreshInFlight.current;

    const attempt = (async () => {
      try {
        const rotate = () => fetch("/api/auth/refresh", { method: "POST" });
        // Cookies are shared between tabs. Serialize rotation across the origin.
        const res = navigator.locks
          ? await navigator.locks.request("ct-auth-cookie", rotate)
          : await rotate();
        // 204 means "no cookie, nobody is signed in" -- the ordinary anonymous
        // case, not a failure. Anything else non-OK is a real refusal.
        if (res.status === 204 || !res.ok) {
          setSession(null);
          return null;
        }
        const next = (await res.json()) as Session;
        setSession(next);
        return next;
      } catch {
        setSession(null);
        return null;
      } finally {
        refreshInFlight.current = null;
      }
    })();

    refreshInFlight.current = attempt;
    return attempt;
  }, []);

  useEffect(() => {
    // One silent refresh on mount. A visitor with no cookie gets a 401 here,
    // which is the ordinary anonymous case and not an error.
    void refresh().finally(() => setInitialising(false));
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string, mfaCode?: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, mfaCode: mfaCode || null }),
    });
    if (!res.ok) {
      const problem = await res.json().catch(() => null);
      throw new ApiError(res.status, problem);
    }
    queryClient.clear();
    setSession((await res.json()) as Session);
  }, [queryClient]);

  const register = useCallback(async (input: RegisterInput) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const problem = await res.json().catch(() => null);
      throw new ApiError(res.status, problem);
    }
    queryClient.clear();
    setSession((await res.json()) as Session);
  }, [queryClient]);

  const signOut = useCallback(async () => {
    const logout = () => fetch("/api/auth/logout", { method: "POST" });
    const res = navigator.locks ? await navigator.locks.request("ct-auth-cookie", logout) : await logout();
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
    queryClient.clear();
    setSession(null);
    // Every role leaves its current workspace on logout. A fresh document also
    // drops the previous page's in-memory authenticated state and cached UI.
    window.location.replace("/dashboard");
  }, [queryClient]);

  const authed = useCallback(
    <T,>(run: (token: string) => Promise<T>, expectedUserId?: string): Promise<T> =>
      runAuthenticated(session, refresh, run, expectedUserId),
    [session, refresh],
  );

  const value = useMemo(
    () => ({ session, initialising, signIn, register, signOut, authed }),
    [session, initialising, signIn, register, signOut, authed],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
