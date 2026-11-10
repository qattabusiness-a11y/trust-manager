import { NextResponse } from "next/server";
import { transactionInputSchema } from "@/lib/validations";
import { clientKey, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side validation for financial transactions. The client never
 * persists a transaction that this endpoint has not accepted.
 * With Supabase, database constraints and RLS enforce the same rules again.
 */
export async function POST(req: Request) {
  const limit = rateLimit(clientKey(req, "tx"), 60, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = transactionInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed.", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 422 });
  }
  const v = parsed.data;
  // Business rules beyond shape validation.
  const when = new Date(`${v.date}T${v.time}:00Z`).getTime();
  if (when > Date.now() + 2 * 86_400_000) {
    return NextResponse.json({ error: "Validation failed.", issues: [{ path: "date", message: "Transactions can't be dated in the future." }] }, { status: 422 });
  }
  return NextResponse.json({ ok: true, data: v }, { headers: { "Cache-Control": "no-store" } });
}
