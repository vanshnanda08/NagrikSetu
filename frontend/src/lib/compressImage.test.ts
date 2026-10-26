import { describe, expect, it } from "vitest";
import { sniffImageMime } from "./compressImage";

describe("sniffImageMime", () => {
  it("trusts JPEG bytes rather than the declared type", async () => {
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "application/pdf" });
    await expect(sniffImageMime(blob)).resolves.toBe("image/jpeg");
  });

  it("rejects content that only claims to be an image", async () => {
    const blob = new Blob(["not an image"], { type: "image/jpeg" });
    await expect(sniffImageMime(blob)).resolves.toBeNull();
  });

  it("recognises PNG and WebP signatures", async () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])]);
    const webp = new Blob(["RIFF0000WEBP"]);
    await expect(sniffImageMime(png)).resolves.toBe("image/png");
    await expect(sniffImageMime(webp)).resolves.toBe("image/webp");
  });
});
