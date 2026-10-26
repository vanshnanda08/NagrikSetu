import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearRefreshCookie, REFRESH_COOKIE } from "@/lib/authCookie";
import { isSameOrigin } from "@/lib/sameOrigin";

/** Drops the refresh cookie. The access token dies with the tab's memory. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ detail: "Same-origin requests only." }, { status: 403 });
  const token = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (token) {
    const upstream = await fetch(`${process.env.API_BASE ?? "http://localhost:8080/api/v1"}/auth/logout`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: token }), signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    if (!upstream?.ok) return NextResponse.json({ detail: "Could not revoke the session. Retry sign out." }, { status: 503 });
  }
  const res = NextResponse.json({ ok: true });
  clearRefreshCookie(res);
  return res;
}
