import "server-only";
import type { ReceiptExtraction } from "@/types";

/**
 * OCR provider contract. Swap MockOCRProvider for a real engine
 * (Tesseract.js worker, a cloud OCR API, ...) without touching the UI.
 * Third-party providers must only be called after explicit user consent.
 */
export interface OCRProvider {
  readonly name: string;
  readonly thirdParty: boolean;
  extract(bytes: Uint8Array, mime: string): Promise<ReceiptExtraction>;
}

async function digest(bytes: Uint8Array): Promise<number[]> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(buf)];
}

const TEMPLATES = [
  { merchant: "Simba Supermarket", paymentMethod: "momo", refPrefix: "MP", min: 8_000, max: 60_000 },
  { merchant: "Kimironko Market — Vendor 214", paymentMethod: "momo", refPrefix: "MP", min: 3_000, max: 25_000 },
  { merchant: "REG Cash Power", paymentMethod: "momo", refPrefix: "MP", min: 5_000, max: 30_000 },
  { merchant: "Pharmacie Conseil", paymentMethod: "momo", refPrefix: "MP", min: 2_000, max: 20_000 },
  { merchant: "Landlord — Mr. Habimana", paymentMethod: "bank", refPrefix: "BK", min: 150_000, max: 250_000 },
  { merchant: "Librairie Caritas", paymentMethod: "card", refPrefix: "INV-", min: 5_000, max: 40_000 },
] as const;

/**
 * Deterministic mock: the same image always yields the same extraction,
 * so demos are reproducible. Values are realistic Rwandan receipts.
 */
export class MockOCRProvider implements OCRProvider {
  readonly name = "MockOCR (development)";
  readonly thirdParty = false;

  async extract(bytes: Uint8Array): Promise<ReceiptExtraction> {
    const h = await digest(bytes);
    const pick = (i: number, n: number) => (h[i]! * 256 + h[i + 1]!) % n;
    const t = TEMPLATES[pick(0, TEMPLATES.length)]!;
    const step = t.max >= 100_000 ? 5_000 : 50;
    const amount = Math.round((t.min + (pick(2, 10_000) / 10_000) * (t.max - t.min)) / step) * step;
    const remaining = 40_000 + pick(4, 400) * 1_000;
    const daysAgo = pick(6, 3);
    const date = new Date(Date.now() - daysAgo * 86_400_000);
    date.setUTCHours(8 + pick(8, 10), pick(10, 60), 0, 0);
    // Smaller images are "harder to read": lower confidence, some fields missing.
    const sizeFactor = Math.min(1, bytes.length / 60_000);
    const confidence = Math.round((0.62 + 0.33 * sizeFactor - pick(12, 8) / 100) * 100) / 100;
    const lowQuality = confidence < 0.7;
    return {
      amount,
      remainingBalance: t.paymentMethod === "momo" && !lowQuality ? remaining : null,
      merchant: lowQuality && pick(14, 2) === 0 ? null : t.merchant,
      transactionDate: date.toISOString(),
      transactionReference: `${t.refPrefix}${String(100_000_000 + pick(16, 899_999_999)).slice(0, 10)}`,
      paymentMethod: t.paymentMethod,
      confidence: Math.max(0.4, Math.min(0.98, confidence)),
    };
  }
}

export function getOCRProvider(): OCRProvider {
  // Future: if (process.env.OCR_PROVIDER === "tesseract") return new TesseractProvider();
  return new MockOCRProvider();
}

/** Magic-byte check so a renamed file can't pass as an image. */
export function sniffImageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}
