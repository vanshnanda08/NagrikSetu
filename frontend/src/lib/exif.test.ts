import { describe, expect, it } from "vitest";
import { exifCapturedAt } from "./exif";

function jpeg(little: boolean) {
  const bytes=new Uint8Array(128); const view=new DataView(bytes.buffer);
  view.setUint16(0,0xffd8);view.setUint16(2,0xffe1);view.setUint16(4,124);
  bytes.set(new TextEncoder().encode("Exif\0\0"),6);
  const base=12;
  view.setUint16(base,little ? 0x4949 : 0x4d4d);view.setUint16(base+2,42,little);view.setUint32(base+4,8,little);
  view.setUint16(base+8,1,little);view.setUint16(base+10,0x8769,little);view.setUint16(base+12,4,little);
  view.setUint32(base+14,1,little);view.setUint32(base+18,26,little);
  view.setUint16(base+26,2,little);
  view.setUint16(base+28,0x9003,little);view.setUint16(base+30,2,little);view.setUint32(base+32,20,little);view.setUint32(base+36,60,little);
  view.setUint16(base+40,0x9011,little);view.setUint16(base+42,2,little);view.setUint32(base+44,7,little);view.setUint32(base+48,80,little);
  bytes.set(new TextEncoder().encode("2024:06:15 12:30:00\0"),base+60);
  bytes.set(new TextEncoder().encode("+05:30\0"),base+80);
  return bytes;
}
describe("capture metadata",() => {
  it.each([true,false])("reads actual capture time and zone (little endian %s)",async little => {
    expect(await exifCapturedAt(new Blob([jpeg(little)]))).toBe("2024-06-15T07:00:00.000Z");
  });
  it("does not invent a date from file modification time",async () => {
    const file=new File([new Uint8Array([255,216,255,217])],"photo.jpg",{ lastModified: Date.now(),type:"image/jpeg" });
    expect(await exifCapturedAt(file)).toBeNull();
  });
  it("handles corrupt and truncated metadata",async () => {
    expect(await exifCapturedAt(new Blob([jpeg(true).slice(0,45)]))).toBeNull();
    expect(await exifCapturedAt(new Blob(["not jpeg"]))).toBeNull();
  });
});
