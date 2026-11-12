import "server-only";

/**
 * Minimal Google Gemini client (REST, no SDK).
 * Key: GEMINI_API_KEY (server-only). Model: GEMINI_MODEL, default gemini-3.1-flash-lite.
 *
 * Google has used two spellings for "answer in this JSON shape" in its API,
 * and some models don't accept every thinking setting, so we try the
 * strictest request first and relax it only when Google rejects the request
 * format (HTTP 400). Other failures are returned to the caller, which falls
 * back to the app's built-in reader.
 */

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
// GEMINI_API_BASE exists only so tests can point at a stand-in server.
const ENDPOINT = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "") + "/models";

export class GeminiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type Body = Record<string, unknown>;

function bodies(prompt: string, schema: object): Body[] {
  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  const base = { temperature: 0, maxOutputTokens: 2048 };
  const thinking = { thinkingConfig: { thinkingLevel: "minimal" } };
  return [
    { contents, generationConfig: { ...base, ...thinking, responseMimeType: "application/json", responseJsonSchema: schema } },
    { contents, generationConfig: { ...base, responseMimeType: "application/json", responseJsonSchema: schema } },
    { contents, generationConfig: { ...base, responseFormat: { text: { mimeType: "application/json", schema } } } },
    { contents, generationConfig: { ...base, responseMimeType: "application/json" } },
  ];
}

/** Pulls the first JSON object out of the model's text (handles ```json fences). */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new GeminiError("The model did not return JSON.", 502);
  }
}

export async function geminiJson(prompt: string, schema: object, opts: { apiKey: string; model?: string; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<unknown> {
  const model = (opts.model || DEFAULT_GEMINI_MODEL).replace(/[^a-z0-9.\-]/gi, "");
  const doFetch = opts.fetchImpl ?? fetch;
  let lastError: GeminiError | null = null;
  for (const body of bodies(prompt, schema)) {
    const res = await doFetch(`${ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    });
    if (res.ok) {
      const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
      const text = (json.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought && p.text).map((p) => p.text).join("");
      if (!text) throw new GeminiError("The model returned an empty answer.", 502);
      return extractJson(text);
    }
    const detail = await res.text().catch(() => "");
    lastError = new GeminiError(`Gemini ${res.status}: ${detail.slice(0, 300)}`, res.status);
    // Only a rejected request format is worth retrying with a simpler body.
    if (res.status !== 400) throw lastError;
    if (/API key not valid|API_KEY_INVALID/i.test(detail)) throw new GeminiError("The Gemini API key is not valid.", 401);
  }
  throw lastError ?? new GeminiError("Gemini request failed.", 502);
}
