"use client";

import { Check, Download, Share, Share2, Smartphone, SquarePlus } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

/* The browser's install prompt (Chrome / Edge / Samsung Internet on Android and desktop). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaState {
  prompt: BeforeInstallPromptEvent | null;
  installed: boolean;
  set: (p: Partial<Omit<PwaState, "set">>) => void;
}

export const usePwa = create<PwaState>((set) => ({ prompt: null, installed: false, set: (p) => set(p) }));

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac with touch.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

const noopSubscribe = () => () => {};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Registers the service worker and listens for the install prompt. Mounted once. */
export function PwaSetup() {
  const set = usePwa((s) => s.set);
  useEffect(() => {
    set({ installed: isStandalone() });
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it for our own Install button
      set({ prompt: e as BeforeInstallPromptEvent });
    };
    const onInstalled = () => set({ installed: true, prompt: null });
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        /* the app works without it */
      });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [set]);
  return null;
}

/** Hook for an Install action anywhere in the app. */
export function useInstall() {
  const { prompt, installed, set } = usePwa();
  // The server renders "desktop"; the phone switches to its real platform after loading.
  const platform = useSyncExternalStore(noopSubscribe, detectPlatform, () => "desktop" as Platform);
  async function install(): Promise<"accepted" | "dismissed" | "manual"> {
    if (!prompt) return "manual";
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    set({ prompt: null, installed: outcome === "accepted" });
    return outcome;
  }
  return { platform, canPrompt: !!prompt, installed, install };
}

export async function shareInstallLink(t: ReturnType<typeof useT>) {
  const url = `${window.location.origin}/install`;
  const text = t("install.shareText");
  try {
    if (navigator.share) {
      await navigator.share({ title: "Trust Manager", text, url });
      return;
    }
  } catch {
    return; // closed the share sheet
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast.success(t("install.copied"));
  } catch {
    toast.message(url);
  }
}

/** Install card: one button where the phone allows it, clear steps where it doesn't (iPhone). */
export function InstallAppCard({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const { platform, canPrompt, installed, install } = useInstall();
  const [showSteps, setShowSteps] = useState(false);

  if (installed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-brand/30 bg-brand-light/40 p-3 text-sm text-brand-dark">
        <Check className="size-4" /> {t("install.installed")}
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => void shareInstallLink(t)}><Share2 /> {t("install.share")}</Button>
      </div>
    );
  }

  const steps =
    platform === "ios"
      ? [
          <>{t("install.ios1")} <b>Safari</b>.</>,
          <span key="2">{t("install.ios2")} <Share className="mx-0.5 inline size-4 align-[-2px]" /> <b>{t("install.shareBtn")}</b>.</span>,
          <span key="3">{t("install.ios3")} <SquarePlus className="mx-0.5 inline size-4 align-[-2px]" /> <b>{t("install.addHome")}</b>, {t("install.ios3b")}</span>,
        ]
      : [
          <>{t("install.and1")} <b>Chrome</b>.</>,
          <>{t("install.and2")} <b>⋮</b> {t("install.and2b")}</>,
          <>{t("install.and3")} <b>{t("install.installApp")}</b> {t("install.or")} <b>{t("install.addHome")}</b>.</>,
        ];

  return (
    <div className={compact ? "space-y-3" : "space-y-3 rounded-2xl border border-line bg-white p-4"}>
      {!compact && (
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand-dark"><Smartphone className="size-5" /></span>
          <div>
            <p className="font-semibold text-navy">{t("install.title")}</p>
            <p className="text-sm text-muted">{t("install.subtitle")}</p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {canPrompt ? (
          <Button onClick={() => void install().then((r) => r === "accepted" && toast.success(t("install.done")))}><Download /> {t("install.installApp")}</Button>
        ) : compact ? (
          <Button onClick={() => setShowSteps((v) => !v)}><Download /> {t("install.howTo")}</Button>
        ) : null}
        <Button variant="outline" onClick={() => void shareInstallLink(t)}><Share2 /> {t("install.share")}</Button>
      </div>
      {(showSteps || (!canPrompt && !compact)) && (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-navy">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}
    </div>
  );
}
