import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { runAuthenticated, type AuthenticatedRequest, type AuthenticatedSession } from "./authenticatedRequest";
import { submitReport } from "./submitReport";

const original = { userId: "citizen-a", accessToken: "expired-access" };
const renewed = { ...original, accessToken: "renewed-access" };
const body = { categoryCode: "POTHOLE", photoUrl: "https://example.test/already-uploaded.jpg", description: "Keep this draft", lat: 30.9, lng: 75.8 };
const result = { publicRef: "CT-2099-000001", issueId: "issue-a" };
const response = (status: number) => new Response(JSON.stringify(status === 201 ? result : { detail: "Refused" }), { status });
const auth = (session: AuthenticatedSession | null, refresh: () => Promise<AuthenticatedSession | null>): AuthenticatedRequest =>
  (run, owner) => runAuthenticated(session, refresh, run, owner);
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe("identity-preserving report submission", () => {
  it("renews expiry once, resending the same body/key under the same citizen", async () => {
    fetchMock.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(201));
    const refresh = vi.fn().mockResolvedValue(renewed);
    await expect(submitReport(body, "submission-key", original.userId, auth(original, refresh))).resolves.toEqual(result);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = fetchMock.mock.calls[0][1]!; const retry = fetchMock.mock.calls[1][1]!;
    expect(first.body).toBe(retry.body);
    expect(JSON.parse(first.body as string)).toEqual(body);
    expect(first.headers).toMatchObject({ "Idempotency-Key": "submission-key", Authorization: "Bearer expired-access" });
    expect(retry.headers).toMatchObject({ "Idempotency-Key": "submission-key", Authorization: "Bearer renewed-access" });
  });
  it("restores the original account before a saved signed-in draft is sent", async () => {
    fetchMock.mockResolvedValue(response(201)); const refresh = vi.fn().mockResolvedValue(renewed);
    await submitReport(body, "saved-key", original.userId, auth(null, refresh));
    expect(refresh).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer renewed-access" });
  });
  it("leaves an anonymous submission anonymous and does not invoke authentication", async () => {
    fetchMock.mockResolvedValue(response(201)); const authed = vi.fn();
    await submitReport(body, "anonymous-key", null, authed);
    expect(authed).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty("Authorization");
  });
  it("does not fall back to anonymous delivery when renewal fails", async () => {
    fetchMock.mockResolvedValue(response(401)); const refresh = vi.fn().mockResolvedValue(null);
    await expect(submitReport(body, "keep-key", original.userId, auth(original, refresh))).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledOnce(); expect(refresh).toHaveBeenCalledOnce();
    expect(body.photoUrl).toBe("https://example.test/already-uploaded.jpg");
  });
  it("does not send a signed-in draft without any renewable session", async () => {
    await expect(submitReport(body, "keep-key", original.userId, auth(null, async () => null))).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("refuses a different account before the first request", async () => {
    const other = { userId: "citizen-b", accessToken: "other-access" };
    await expect(submitReport(body, "keep-key", original.userId, auth(other, async () => other))).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("refuses a cookie switched to another account during renewal", async () => {
    fetchMock.mockResolvedValue(response(401));
    await expect(submitReport(body, "keep-key", original.userId, auth(original, async () => ({ userId: "citizen-b", accessToken: "other-access" })))).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("does not loop when a renewed token is refused", async () => {
    fetchMock.mockResolvedValue(response(401)); const refresh = vi.fn().mockResolvedValue(renewed);
    await expect(submitReport(body, "keep-key", original.userId, auth(original, refresh))).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2); expect(refresh).toHaveBeenCalledOnce();
  });
  it.each([400, 403, 409, 429, 503])("preserves the API's %s refusal without refreshing or anonymous fallback", async status => {
    fetchMock.mockResolvedValue(response(status)); const refresh = vi.fn();
    await expect(submitReport(body, "keep-key", original.userId, auth(original, refresh))).rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenCalledOnce(); expect(refresh).not.toHaveBeenCalled();
  });
  it("propagates transport failure for the existing offline queue to handle", async () => {
    const error = new TypeError("Failed to fetch"); fetchMock.mockRejectedValue(error);
    await expect(submitReport(body, "keep-key", original.userId, auth(original, async () => renewed))).rejects.toBe(error);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("retains generic authenticated-request behavior for other workspaces", async () => {
    const run = vi.fn().mockRejectedValueOnce(new ApiError(401, null)).mockResolvedValueOnce("loaded");
    await expect(runAuthenticated(original, async () => renewed, run)).resolves.toBe("loaded");
    expect(run.mock.calls).toEqual([["expired-access"], ["renewed-access"]]);
  });
});
