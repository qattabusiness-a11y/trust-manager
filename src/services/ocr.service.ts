import { MAX_RECEIPT_BYTES, RECEIPT_MIME_TYPES } from "@/constants";
import { parseReceiptText, sniffImageType } from "@/lib/receipts/parse";
import type { ReceiptProcessingResult } from "@/types";

/** OCR contract. The UI depends only on this interface, so another engine can be swapped in. */
export interface OCRService {
  process(file: File, opts?: { signal?: AbortSignal; onProgress?: (fraction: number) => void }): Promise<ReceiptProcessingResult>;
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

const OCR_TIMEOUT_MS = 90_000;

let warmed = false;
/**
 * Start downloading the reader as soon as the receipt dialog opens, while the
 * person is still choosing a photo. Only engine and language files are
 * fetched (they go into the normal browser cache); no image is involved.
 */
export function warmUpOcr(): void {
  if (warmed || typeof window === "undefined") return;
  warmed = true;
  const idle = (cb: () => void) => ((window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200)))(cb);
  idle(() => {
    void import("tesseract.js").catch(() => undefined);
    for (const url of ["/ocr/worker.min.js", "/ocr/lang/eng.traineddata.gz"]) {
      void fetch(url, { priority: "low" } as RequestInit).catch(() => undefined);
    }
  });
}

/** Draw the image on a canvas, enlarging small screenshots so text is easier to read. */
async function toCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = bitmap.width < 1100 ? Math.min(2.5, 1400 / bitmap.width) : bitmap.width > 2600 ? 2600 / bitmap.width : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no-canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

/**
 * Reads receipts ON THE DEVICE with Tesseract (WebAssembly).
 *
 * Zero-storage by construction: the image is never uploaded — not to Trust
 * Manager's server, not to any third party — and is never written to
 * localStorage, IndexedDB or a database. The OCR engine and language data
 * are served by this app itself (public/ocr). When reading finishes or
 * fails, the worker is terminated and the working canvas is wiped in a
 * `finally` block, and that cleanup is verified before it is reported.
 */
export class OnDeviceOCRService implements OCRService {
  readonly name = "On-device reader (Tesseract)";

  async process(file: File, opts: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {}): Promise<ReceiptProcessingResult> {
    const err = validateReceiptFile(file);
    if (err) throw new ReceiptProcessingError(err, true);
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (!sniffImageType(head)) throw new ReceiptProcessingError("This file doesn't look like a valid image.", true);

    let canvas: HTMLCanvasElement | null = null;
    type OcrWorker = { recognize: (img: HTMLCanvasElement) => Promise<{ data: { text: string; confidence: number } }>; terminate: () => Promise<unknown> };
    const held: { worker: OcrWorker | null } = { worker: null };
    let terminated = false;
    let failure: unknown = null;
    let text = "";
    let confidence = 0;
    try {
      const { createWorker } = await import("tesseract.js");
      canvas = await toCanvas(file);
      held.worker = (await createWorker("eng", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr",
        langPath: "/ocr/lang",
        gzip: true,
        workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") opts.onProgress?.(m.progress);
        },
      })) as unknown as OcrWorker;
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), OCR_TIMEOUT_MS));
      const aborted = new Promise<never>((_, reject) => opts.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
      const result = await Promise.race([held.worker.recognize(canvas), timeout, aborted]);
      text = result.data.text ?? "";
      confidence = result.data.confidence ?? 0;
    } catch (e) {
      failure = e;
    } finally {
      // Always release the image, whether reading succeeded or failed.
      try {
        await held.worker?.terminate();
        terminated = true;
      } catch {
        terminated = false;
      }
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    const verified = (held.worker ? terminated : true) && (!canvas || (canvas.width === 0 && canvas.height === 0));
    if (failure) {
      const reason = failure instanceof Error && failure.message === "timeout" ? "Reading took too long. Try a smaller or clearer image." : "We couldn't read this receipt. Please try again with a clearer image.";
      throw new ReceiptProcessingError(reason, verified);
    }
    const extraction = parseReceiptText(text, confidence);
    if (extraction.fieldsFound === 0 && text.replace(/\s/g, "").length < 12) {
      throw new ReceiptProcessingError("No readable text was found in this image. Try a sharper screenshot.", verified);
    }
    return { extraction, cleanup: { deleted: true, verified }, processor: this.name };
  }
}

export const ocrService: OCRService = new OnDeviceOCRService();
