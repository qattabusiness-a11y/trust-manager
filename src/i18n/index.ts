"use client";

import { useCallback } from "react";
import { useDisplayStore, type Language } from "@/stores/display.store";
import { DICTIONARIES, en, type MessageKey } from "./dictionaries";

export type { MessageKey };
export const LANGUAGES: { code: Language; label: string }[] = [
  { code: "en", label: "English" },
  { code: "rw", label: "Kinyarwanda" },
];

export function translate(lang: Language, key: MessageKey, vars?: Record<string, string | number>): string {
  const dict = DICTIONARIES[lang] as Partial<Record<MessageKey, string>>;
  let text = dict[key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

/** `const t = useT(); t("nav.overview")` — re-renders when the language changes. */
export function useT() {
  const lang = useDisplayStore((s) => s.language);
  return useCallback((key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
}

export function useLanguage(): Language {
  return useDisplayStore((s) => s.language);
}
