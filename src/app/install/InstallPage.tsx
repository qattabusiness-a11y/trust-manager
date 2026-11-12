"use client";

import { Download, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/layout/DisplaySettings";
import { LogoFull } from "@/components/layout/Logo";
import { InstallAppCard } from "@/components/pwa/install";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

/** Public page to send people: install Trust Manager on any phone. */
export function InstallPage({ apkUrl }: { apkUrl: string | null }) {
  const t = useT();
  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <LogoFull className="w-28" />
          <LanguageSwitcher />
        </div>
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static icon */}
          <img src="/brand/apple-touch-icon.png" alt="" width={72} height={72} className="size-[72px] rounded-2xl border border-line shadow-sm" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-navy">{t("install.pageTitle")}</h1>
            <p className="mt-1 text-sm text-muted">{t("install.pageText")}</p>
          </div>
        </div>

        <InstallAppCard />

        {apkUrl && (
          <div className="space-y-2 rounded-2xl border border-line bg-white p-4">
            <p className="font-semibold text-navy">{t("install.apk")}</p>
            <p className="text-sm text-muted">{t("install.apkText")}</p>
            <Button asChild variant="outline"><a href={apkUrl} download><Download /> APK</a></Button>
          </div>
        )}

        <ul className="space-y-2 text-sm text-navy">
          <li className="flex gap-2"><Wallet className="size-4 shrink-0 text-brand-dark" /> {t("install.subtitle")}</li>
          <li className="flex gap-2"><Sparkles className="size-4 shrink-0 text-brand-dark" /> Trust Assistant · English & Kinyarwanda</li>
          <li className="flex gap-2"><ShieldCheck className="size-4 shrink-0 text-brand-dark" /> Receipts are read on your phone and never stored.</li>
        </ul>

        <Button asChild className="w-full"><Link href="/overview">{t("install.open")}</Link></Button>
      </div>
    </main>
  );
}
