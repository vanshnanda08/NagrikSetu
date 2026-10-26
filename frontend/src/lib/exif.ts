/** Reads JPEG EXIF DateTimeOriginal; missing/invalid metadata stays unknown. */
export async function exifCapturedAt(file: Blob): Promise<string | null> {
  // JPEG metadata precedes the image scan; cap work on hostile/oversized files.
  const data = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
  const ascii = (at: number, length: number) => {
    if (at < 0 || at + length > data.byteLength) throw new Error("Invalid EXIF offset");
    return Array.from({ length }, (_, i) => String.fromCharCode(data.getUint8(at + i))).join("").replace(/\0.*$/, "");
  };
  try {
    if (data.getUint16(0) !== 0xffd8) return null;
    for (let at = 2; at + 4 < data.byteLength;) {
      const marker = data.getUint16(at);
      if (marker === 0xffda || marker === 0xffd9) break;
      const size = data.getUint16(at + 2);
      if (size < 2 || at + 2 + size > data.byteLength) return null;
      if (marker === 0xffe1 && ascii(at + 4, 6) === "Exif") {
        const base = at + 10;
        const little = data.getUint16(base) === 0x4949;
        if (!little && data.getUint16(base) !== 0x4d4d) return null;
        const u16 = (p: number) => data.getUint16(base + p, little);
        const u32 = (p: number) => data.getUint32(base + p, little);
        if (u16(2) !== 42) return null;
        const entries = (offset: number) => {
          const count = u16(offset);
          if (count > 512) throw new Error("Invalid EXIF entry count");
          return Array.from({ length: count }, (_, i) => offset + 2 + i * 12);
        };
        const pointer = entries(u32(4)).find((p) => u16(p) === 0x8769);
        if (pointer === undefined) return null;
        const tags = entries(u32(pointer + 8));
        const text = (tag: number) => {
          const p = tags.find((p) => u16(p) === tag);
          if (p === undefined || u16(p + 2) !== 2) return null;
          const length = u32(p + 4);
          if (length < 1 || length > 64) return null;
          return ascii(base + (length <= 4 ? p + 8 : u32(p + 8)), length);
        };
        const raw = text(0x9003);
        if (!raw || !/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return null;
        const iso = raw.slice(0, 10).replaceAll(":", "-") + "T" + raw.slice(11);
        const offset = text(0x9011);
        // Older cameras omit the offset. Interpret that wall time in the
        // browser's zone, rather than claiming it was UTC.
        const date = new Date(iso + (offset && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : ""));
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
      }
      at += 2 + size;
    }
  } catch { /* Malformed metadata does not prevent reporting a civic issue. */ }
  return null;
}
