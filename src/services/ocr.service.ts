import { MAX_RECEIPT_BYTES, RECEIPT_MIME_TYPES } from "@/constants";
import type { ReceiptProcessingResult } from "@/types";

/** Client-side OCR contract. The UI depends only on this interface. */
export interface OCRService {
  process(file: File, opts?: { consent?: boolean; signal?: AbortSignal }): Promise<ReceiptProcessingResult>;
}

export function validateReceiptFile(file: File): string | null {
  if (!RECEIPT_MIME_TYPES.includes(file.type as (typeof RECEIPT_MIME_TYPES)[number])) return "Use a PNG, JPG, JPEG or WEBP image.";
  if (file.size > MAX_RECEIPT_BYTES) return "Image is larger than 5 MB. Try a screenshot instead of a photo.";
  if (file.size < 100) return "This file looks empty.";
  return null;
}

export class ReceiptProcessingError extends Error {
  constructor(message: string, public cleanupVerified: boolean) {
    super(message);
  }
}

/**
 * Sends the image to our own ephemeral /api/ocr endpoint (MockOCR in
 * development). The file is never written to localStorage, IndexedDB or
 * a database on the client.
 */
export class HttpOCRService implements OCRService {
  async process(file: File, opts: { consent?: boolean; signal?: AbortSignal } = {}): Promise<ReceiptProcessingResult> {
    const err = validateReceiptFile(file);
    if (err) throw new ReceiptProcessingError(err, true);
    const body = new FormData();
    body.append("file", file);
    if (opts.consent) body.append("consent", "yes");
    let res: Response;
    try {
      res = await fetch("/api/ocr", { method: "POST", body, signal: opts.signal, cache: "no-store" });
    } catch {
      throw new ReceiptProcessingError("Network error — the receipt was not processed. Please retry.", true);
    }
    const json = (await res.json().catch(() => ({}))) as Partial<ReceiptProcessingResult> & { error?: string; cleanup?: { verified: boolean } };
    if (!res.ok) throw new ReceiptProcessingError(json.error ?? "Processing failed. Please retry.", json.cleanup?.verified ?? true);
    return json as ReceiptProcessingResult;
  }
}

export const ocrService: OCRService = new HttpOCRService();
