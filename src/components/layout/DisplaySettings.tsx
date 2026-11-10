"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { Check, Coins, Languages } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/inputs";
import { LANGUAGES, useT } from "@/i18n";
import { SUPPORTED_CURRENCIES, setDisplayConversion } from "@/lib/money";
import { cn } from "@/lib/utils";
import { FX_SOURCE_URL, fetchRates, ratesAreFresh, resolveRate } from "@/services/fx.service";
import { useDisplayStore } from "@/stores/display.store";

const DISPLAY_CURRENCIES = ["RWF", "USD", "EUR", "GBP", "KES", "UGX", "TZS", "BIF", "CDF", "ZAR", "AED", "CNY"].filter((c) => SUPPORTED_CURRENCIES.includes(c));

const fmtRate = (r: number) => (r >= 100 ? r.toFixed(0) : r >= 1 ? r.toFixed(2) : r.toPrecision(3));

/**
 * Applies the person's display currency for the whole signed-in app and
 * returns a key that changes whenever the conversion changes, so every
 * amount on screen is re-rendered with it.
 */
export function useDisplayConversion(baseCurrency: string) {
  const target = useDisplayStore((s) => s.displayCurrency) ?? baseCurrency;
  const rates = useDisplayStore((s) => s.rates);
  const manual = useDisplayStore((s) => s.manualRates);
  const setRates = useDisplayStore((s) => s.setRates);
  const language = useDisplayStore((s) => s.language);
  // Only set from the async callbacks; "loading" is derived below.
  const [failedFor, setFailedFor] = useState<string | null>(null);

  useEffect(() => {
    if (target === baseCurrency || ratesAreFresh(rates, baseCurrency)) return;
    const ctrl = new AbortController();
    fetchRates(baseCurrency, ctrl.signal)
      .then((r) => {
        setRates(r);
        setFailedFor(null);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setFailedFor(baseCurrency);
      });
    return () => ctrl.abort();
  }, [target, baseCurrency, rates, setRates]);

  useEffect(() => {
    document.documentElement.lang = language === "rw" ? "rw" : "en";
  }, [language]);

  const resolved = useMemo(() => resolveRate(baseCurrency, target, rates, manual), [baseCurrency, target, rates, manual]);
  const active = target !== baseCurrency && resolved ? { base: baseCurrency, target, rate: resolved.rate } : null;
  // Applied during render so every child formats with the same conversion.
  setDisplayConversion(active);
  return {
    key: active ? `${target}:${active.rate}` : baseCurrency,
    active,
    resolved,
    target,
    status: target !== baseCurrency && !resolved ? (failedFor === baseCurrency ? "error" : "loading") : "idle",
  };
}

export function CurrencySwitcher({ baseCurrency }: { baseCurrency: string }) {
  const t = useT();
  const target = useDisplayStore((s) => s.displayCurrency) ?? baseCurrency;
  const setDisplayCurrency = useDisplayStore((s) => s.setDisplayCurrency);
  const setManualRate = useDisplayStore((s) => s.setManualRate);
  const manual = useDisplayStore((s) => s.manualRates);
  const rates = useDisplayStore((s) => s.rates);
  const resolved = resolveRate(baseCurrency, target, rates, manual);
  const [typed, setTyped] = useState("");

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-semibold text-navy hover:bg-slate-50" aria-label={t("header.currency")}>
          <Coins className="size-4 text-brand-dark" />
          {target}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-[min(92vw,320px)] rounded-2xl border border-line bg-white p-2 shadow-xl">
          <p className="px-2 pb-1 pt-1 text-xs font-semibold text-muted">{t("fx.title")}</p>
          <div className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto">
            {DISPLAY_CURRENCIES.map((c) => (
              <DropdownMenu.Item
                key={c}
                onSelect={(e) => {
                  e.preventDefault();
                  setDisplayCurrency(c === baseCurrency ? null : c);
                }}
                className={cn("flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-slate-50", c === target && "bg-brand-light text-brand-dark")}
              >
                <span>{c === baseCurrency ? t("fx.household", { code: c }) : c}</span>
                {c === target && <Check className="size-4" />}
              </DropdownMenu.Item>
            ))}
          </div>
          <div className="mt-2 space-y-2 border-t border-line px-2 pt-2 text-[11px] text-muted">
            {target !== baseCurrency && resolved && (
              <p>
                {resolved.source === "manual"
                  ? t("fx.manualSource", { base: baseCurrency, rate: fmtRate(resolved.rate), target })
                  : t("fx.source", {
                      base: baseCurrency,
                      rate: fmtRate(resolved.rate),
                      target,
                      source: rates?.source ?? "",
                      when: resolved.updatedAt ? formatDistanceToNow(new Date(resolved.updatedAt), { addSuffix: true }) : "",
                    })}{" "}
                {resolved.source === "provider" && (
                  <a href={FX_SOURCE_URL} target="_blank" rel="noreferrer" className="underline">
                    Rates by Exchange Rate API
                  </a>
                )}
              </p>
            )}
            {target !== baseCurrency && (!resolved || resolved.source === "manual") && (
              <div className="space-y-1.5">
                {!resolved && <p className="text-warn-dark">{t("fx.unavailable", { target })}</p>}
                <div className="flex gap-1.5">
                  <Input className="h-8 text-xs" type="number" inputMode="decimal" min={0} step="any" placeholder={t("fx.ratePlaceholder", { target, base: baseCurrency })} value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                  <Button size="sm" variant="outline" onClick={() => { const n = Number(typed); if (n > 0) setManualRate(baseCurrency, target, n); }}>{t("fx.useRate")}</Button>
                </div>
                {resolved?.source === "manual" && (
                  <button className="underline" onClick={() => setManualRate(baseCurrency, target, null)}>{t("fx.clearManual")}</button>
                )}
              </div>
            )}
            <p>{t("fx.storedNote", { base: baseCurrency })}</p>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function LanguageSwitcher() {
  const t = useT();
  const language = useDisplayStore((s) => s.language);
  const setLanguage = useDisplayStore((s) => s.setLanguage);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-semibold uppercase text-navy hover:bg-slate-50" aria-label={t("header.language")}>
          <Languages className="size-4 text-brand-dark" />
          {language}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-44 rounded-xl border border-line bg-white p-1 shadow-xl">
          {LANGUAGES.map((l) => (
            <DropdownMenu.Item key={l.code} onSelect={() => setLanguage(l.code)} className={cn("flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-slate-50", l.code === language && "font-semibold text-brand-dark")}>
              {l.label}
              {l.code === language && <Check className="size-4" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function ConversionBanner({ base, target, rate }: { base: string; target: string; rate: number }) {
  const t = useT();
  return (
    <div className="border-b border-brand/20 bg-brand-light/50 px-4 py-1.5 text-center text-[11px] text-brand-dark sm:px-6">
      {t("fx.banner", { base, target, rate: fmtRate(rate) })}
    </div>
  );
}
