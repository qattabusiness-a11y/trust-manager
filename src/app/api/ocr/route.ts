import { NextResponse } from "next/server";
import { MAX_RECEIPT_BYTES, RECEIPT_MIME_TYPES } from "@/constants";
import { getOCRProvider, sniffImageType } from "@/server/ocr";
import { clientKey, rateLimit } from "@/server/rate-limit";
import { deleteTempVerified, getTemp, purgeExpired, putTemp } from "@/server/temp-store";
import type { ReceiptProcessingResult } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ephemeral receipt processing.
 * The image lives only in memory for the duration of this request and is
 * deleted (and the deletion verified) in `finally`, even when extraction fails.
 * Only the structured extraction is returned; nothing is logged or stored.
 */
export async function POST(req: Request) {
  const limit = rateLimit(clientKey(req, "ocr"), 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many receipts at once. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Upload could not be read." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No image was uploaded." }, { status: 400 });
  if (!RECEIPT_MIME_TYPES.includes(file.type as (typeof RECEIPT_MIME_TYPES)[number])) {
    return NextResponse.json({ error: "Use a PNG, JPG or WEBP image." }, { status: 415 });
  }
  if (file.size > MAX_RECEIPT_BYTES) return NextResponse.json({ error: "Image is larger than 5 MB." }, { status: 413 });

  const provider = getOCRProvider();
  if (provider.thirdParty && form.get("consent") !== "yes") {
    return NextResponse.json({ error: "Consent is required before sending a receipt to an external OCR service." }, { status: 403 });
  }

  let tempId: string | null = null;
  let deleted = false;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniffImageType(bytes);
    if (!sniffed) {
      bytes.fill(0);
      return NextResponse.json({ error: "This file doesn't look like a valid image." }, { status: 415, headers: { "X-Receipt-Deleted": "true" } });
    }
    tempId = putTemp(bytes);
    const held = getTemp(tempId);
    if (!held) throw new Error("expired");
    const extraction = await provider.extract(held, sniffed);
    deleted = deleteTempVerified(tempId);
    tempId = null;
    const body: ReceiptProcessingResult = { extraction, cleanup: { deleted: true, verified: deleted }, processor: provider.name };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "We couldn't read this receipt. Please try again with a clearer image.", cleanup: { deleted: true, verified: tempId ? false : true } },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    if (tempId) {
      deleted = deleteTempVerified(tempId);
      if (!deleted) purgeExpired(); // secondary cleanup trigger
    }
  }
}
