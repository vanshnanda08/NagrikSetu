import { expect, it } from "vitest";
import { safeRedirect } from "./safeRedirect";

it("preserves local routes and rejects executable or external auth redirects", () => {
  expect(safeRedirect("/staff/queue?tab=mine")).toBe("/staff/queue?tab=mine");
  for (const value of ["javascript:alert(1)", "https://outside.test", "//outside.test", "/\\outside.test", "/\n/outside.test", undefined]) {
    expect(safeRedirect(value)).toBe("/");
  }
});
