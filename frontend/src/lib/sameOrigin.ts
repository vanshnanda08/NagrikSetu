/** Reject browser cross-origin writes before reading or setting auth cookies. */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return false;
  const origin = request.headers.get("origin");
  // Non-browser clients may omit Origin; browsers set it for cross-origin POSTs.
  return origin === null || origin === new URL(request.url).origin;
}
