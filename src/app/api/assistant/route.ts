import { NextResponse } from "next/server";
import { AI_OUTPUT_SCHEMA, assistantRequestSchema, buildPrompt, normalizeAiOutput } from "@/lib/assistant/ai";
import { GeminiError, geminiJson } from "@/server/assistant/gemini";
import { clientKey, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Trust Assistant's AI model (Google Gemini).
 *
 * POST { text, language, today, nowTime, goals, products }
 *   → { drafts, questions, saveRequested } (types in src/lib/assistant/types.ts)
 *   → { configured: false } when GEMINI_API_KEY isn't set (the app then uses
 *     its built-in reader).
 *
 * Sent to Google: the message, the last few chat messages, today's date,
 * savings-goal and product names, and a short permission-checked summary of
 * the household's totals. The list of transactions is never sent. Receipt
 * images and statement files are read on the device and are never sent here.
 * Drafts are checked here and validated again by the app when saved.
 */

/**
 * In online mode, only signed-in people can use the model (protects your quota).
 * Returns the user's id, "offline" in offline mode, or null when not signed in.
 */
async function signedIn(req: Request): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (process.env.NEXT_PUBLIC_DATA_MODE !== "supabase" || !url || !anon) return "offline"; // offline mode has no server accounts
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string };
    return user.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ configured: false, message: "No AI model configured; the built-in assistant is used." });
  }
  // Light per-network guard first, then the real limit per signed-in person
  // (people on the same Wi-Fi share a network address, e.g. at a pitch).
  if (!rateLimit(clientKey(req, "assistant-ip"), 120, 60_000).ok) return NextResponse.json({ error: "Too many messages. Please wait a moment." }, { status: 429 });
  const userId = await signedIn(req);
  if (!userId) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const limit = rateLimit(userId === "offline" ? clientKey(req, "assistant") : `assistant:user:${userId}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many messages. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = assistantRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const raw = await geminiJson(buildPrompt(parsed.data), AI_OUTPUT_SCHEMA, { apiKey, model: process.env.GEMINI_MODEL });
    return NextResponse.json({ ...normalizeAiOutput(raw, parsed.data), provider: "gemini" });
  } catch (e) {
    const status = e instanceof GeminiError ? e.status : 502;
    // Never echo the key or Google's full answer to the browser.
    console.error("assistant: Gemini failed", e instanceof Error ? e.message.slice(0, 200) : e);
    return NextResponse.json(
      { error: status === 429 ? "The AI is busy (free limit reached). The built-in assistant was used." : "The AI could not answer. The built-in assistant was used." },
      { status: status === 429 ? 429 : 502 },
    );
  }
}
