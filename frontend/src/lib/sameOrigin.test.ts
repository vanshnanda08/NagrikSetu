import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./sameOrigin";

describe("cookie route origin guard", () => {
  const request = (headers: HeadersInit) => new Request("https://civic.example/api/auth/login", { method: "POST", headers });
  it("allows same-origin browser requests and non-browser clients", () => {
    expect(isSameOrigin(request({ origin: "https://civic.example", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOrigin(request({}))).toBe(true);
  });
  it("rejects cross-site and sibling-origin requests", () => {
    expect(isSameOrigin(request({ origin: "https://attacker.example" }))).toBe(false);
    expect(isSameOrigin(request({ origin: "null" }))).toBe(false);
    expect(isSameOrigin(request({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOrigin(request({ origin: "https://other.civic.example", "sec-fetch-site": "same-site" }))).toBe(false);
  });
});
