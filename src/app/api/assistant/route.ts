import { NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hook for a future AI model behind Trust Assistant.
 *
 * Contract: POST { text, language, today, goals, products } and answer
 * { drafts: Draft[], questions: QuestionTopic[] } using the types in
 * src/lib/assistant/types.ts. Drafts are never saved here — the app shows
 * them to the person, who confirms before anything is written.
 *
 * Until AI_PROVIDER_API_KEY (server-only) is set and a provider is wired
 * in, this answers { configured: false } and the app uses its built-in offline assistant.
 * Receipt images and files are read on the device and are never sent here.
 */
export async function POST(req: Request) {
  const limit = rateLimit(clientKey(req, "assistant"), 30, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  if (!process.env.AI_PROVIDER_API_KEY) {
    return NextResponse.json({ configured: false, message: "No AI provider configured; the built-in assistant is used." });
  }
  return NextResponse.json({ configured: false, message: "AI provider key is set but no provider adapter is installed yet." });
}
