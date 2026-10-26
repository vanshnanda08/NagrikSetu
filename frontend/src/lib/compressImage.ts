/**
 * Client-side image compression, before anything is uploaded.
 *
 * Blueprint §3.2 budgets ~300 KB after compression with the longest edge at
 * 1600px. The reason is the venue and the field: a 4 MB phone photo over a
 * weak connection is the difference between a report submitted in twenty
 * seconds and a report abandoned.
 *
 * Two properties worth stating because they are easy to get wrong:
 *
 * 1. The preview shown to the user is the COMPRESSED image, not the original.
 *    Showing the original would let somebody approve a photo that is not the
 *    photo being sent, and the whole point of compressing is that the result
 *    is still legible enough to prove a pothole.
 *
 * 2. Quality is stepped down until the size target is met, rather than fixed.
 *    A fixed quality produces wildly different sizes for a flat wall and a
 *    detailed street scene, and it is the street scene that matters here.
 */

import { exifCapturedAt } from "./exif";

export interface CompressedImage {
  blob: Blob;
  /** Object URL of the compressed result. The caller must revoke it. */
  previewUrl: string;
  width: number;
  height: number;
  bytes: number;
  originalBytes: number;
  /** 64-bit perceptual difference hash, encoded as 16 hex characters. */
  perceptualHash: string;
  /** Browser file metadata; null when the source does not carry a useful time. */
  capturedAt: string | null;
}

const MAX_EDGE = 1600;
const TARGET_BYTES = 300 * 1024;
const QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52, 0.42];

/** Types we will actually send. Checked before any work, per blueprint §4. */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export class UnsupportedImageError extends Error {
  constructor(type: string) {
    super(
      `That file is a ${type || "unknown type"}. Choose a photo — JPEG, PNG or WebP.`,
    );
  }
}

export async function compressImage(file: File): Promise<CompressedImage> {
  const actualType = await sniffImageMime(file);
  if (!actualType || !ACCEPTED.includes(actualType)) {
    throw new UnsupportedImageError(actualType || file.type);
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the photo for upload.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    let blob: Blob | null = null;
    for (const quality of QUALITY_STEPS) {
      blob = await toBlob(canvas, quality);
      if (blob && blob.size <= TARGET_BYTES) break;
    }
    if (!blob) throw new Error("Could not prepare the photo for upload.");

    return {
      blob,
      previewUrl: URL.createObjectURL(blob),
      width,
      height,
      bytes: blob.size,
      originalBytes: file.size,
      perceptualHash: differenceHash(canvas),
      capturedAt: await exifCapturedAt(file),
    };
  } finally {
    bitmap.close();
  }
}

/**
 * Identifies supported images from their signature, never from the caller's
 * Content-Type. A renamed executable with `type=image/jpeg` stops here before
 * it reaches the upload service.
 */
export async function sniffImageMime(blob: Blob): Promise<string | null> {
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  const ascii = String.fromCharCode(...bytes);
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  if (ascii.slice(4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(ascii.slice(8, 12))) {
    return "image/heic";
  }
  return null;
}

/** Horizontal 9x8 luminance comparisons produce the conventional 64-bit dHash. */
function differenceHash(source: HTMLCanvasElement): string {
  const tiny = document.createElement("canvas");
  tiny.width = 9;
  tiny.height = 8;
  const context = tiny.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not fingerprint the photo.");
  context.drawImage(source, 0, 0, 9, 8);
  const pixels = context.getImageData(0, 0, 9, 8).data;
  let bits = "";
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = luminance(pixels, (y * 9 + x) * 4);
      const right = luminance(pixels, (y * 9 + x + 1) * 4);
      bits += left > right ? "1" : "0";
    }
  }
  let hex = "";
  for (let at = 0; at < bits.length; at += 4) {
    hex += Number.parseInt(bits.slice(at, at + 4), 2).toString(16);
  }
  return hex;
}

function luminance(pixels: Uint8ClampedArray, at: number): number {
  return pixels[at] * 0.299 + pixels[at + 1] * 0.587 + pixels[at + 2] * 0.114;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}
