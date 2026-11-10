import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { MockOCRProvider, sniffImageType } from "../ocr";
import { deleteTempVerified, getTemp, purgeExpired, putTemp, tempObjectCount } from "../temp-store";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: 2000 }, (_, i) => i % 251)]);

describe("ephemeral receipt processing", () => {
  it("validates real image bytes", () => {
    expect(sniffImageType(png)).toBe("image/png");
    expect(sniffImageType(new TextEncoder().encode("not an image"))).toBeNull();
  });
  it("returns deterministic structured data", async () => {
    const ocr = new MockOCRProvider();
    const a = await ocr.extract(png);
    const b = await ocr.extract(png);
    expect(a.amount).toBe(b.amount);
    expect(a.confidence).toBeGreaterThan(0);
  });
  it("deletes and verifies deletion, wiping the buffer", () => {
    const bytes = png.slice();
    const id = putTemp(bytes);
    expect(getTemp(id)).not.toBeNull();
    expect(deleteTempVerified(id)).toBe(true);
    expect(getTemp(id)).toBeNull();
    expect(bytes.every((b) => b === 0)).toBe(true);
  });
  it("expires anything left behind", () => {
    const before = tempObjectCount();
    putTemp(png.slice(), -1);
    expect(purgeExpired()).toBeGreaterThanOrEqual(1);
    expect(tempObjectCount()).toBe(before);
  });
});
