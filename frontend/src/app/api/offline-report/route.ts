import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { REFRESH_COOKIE, setRefreshCookie } from "@/lib/authCookie";

/** The worker never stores credentials, and cannot switch a queued report's owner. */
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ detail: "Same-origin requests only." }, { status: 403 });
  const input = await request.json().catch(() => null);
  if (!input || typeof input.id !== "string" || !input.body || (input.userId !== null && typeof input.userId !== "string")) return NextResponse.json({ detail: "Invalid queued report." }, { status: 400 });
  const base = process.env.API_BASE ?? "http://localhost:8080/api/v1";
  let accessToken: string | undefined;
  let rotated: string | undefined;
  const reply = (data: unknown, status: number, retryAfter?: string | null) => {
    const response = NextResponse.json(data, { status });
    if (rotated) setRefreshCookie(response, rotated);
    if (retryAfter) response.headers.set("Retry-After", retryAfter);
    return response;
  };
  try {
    if (input.userId) {
      const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
      if (!refreshToken) return reply({ detail: "Sign in to the account that queued this report, then retry." }, 401);
      const auth = await fetch(`${base}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken }), signal: AbortSignal.timeout(15000) });
      if (!auth.ok) return reply({ detail: "Could not renew the original account session. Sign in and retry." }, auth.status >= 500 ? 503 : 401);
      const session = await auth.json(); rotated = session.refreshToken;
      if (session.userId !== input.userId) return reply({ detail: "This report belongs to a different account. Sign in to its original account, then retry." }, 409);
      accessToken = session.accessToken;
    }
    const upstream = await fetch(`${base}/reports`, {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": input.id, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(input.body), signal: AbortSignal.timeout(45000),
    });
    return reply(await upstream.json().catch(() => ({ detail: "Report service returned an invalid response." })), upstream.status, upstream.headers.get("Retry-After"));
  } catch { return reply({ detail: "Report service is unavailable. Your report is still queued." }, 503); }
}
