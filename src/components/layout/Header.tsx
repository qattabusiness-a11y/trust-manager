"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck, FlaskConical, LogOut, Plus, ScanLine, Settings as SettingsIcon, Smartphone } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { SEVERITY_STYLES } from "@/components/shared";
import { useAction, useList } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { cn, initials } from "@/lib/utils";
import { logout } from "@/services/auth.service";
import { useAuthStore } from "@/stores/auth.store";
import { useUIStore } from "@/stores/preferences.store";
import { useT } from "@/i18n";
import { CurrencySwitcher, LanguageSwitcher } from "./DisplaySettings";
import { LogoMark } from "./Logo";
import { NAV } from "./nav";

export function Header({ baseCurrency }: { baseCurrency: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const s = useSession();
  const t = useT();
  const signOut = useAuthStore((st) => st.signOut);
  const setQuickAdd = useUIStore((st) => st.setQuickAdd);
  const setReceipt = useUIStore((st) => st.setReceiptOpen);
  const notifications = useList("notifications");
  const { run } = useAction();
  const inApp = (notifications.data ?? []).filter((n) => n.channel === "in_app").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unread = inApp.filter((n) => !n.readAt);
  const navItem = NAV.find((n) => pathname.startsWith(n.href));
  const title = navItem ? t(navItem.t) : "Trust Manager";
  const dev = s.storeMode === "local";

  async function markAllRead() {
    await run(async (api) => {
      for (const n of unread) await api.update("notifications", n.id, { readAt: new Date().toISOString() });
    });
  }

  async function doLogout() {
    await logout();
    signOut();
    qc.clear();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b sm:gap-3 border-line bg-canvas/90 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link href="/overview" aria-label={t("nav.goHome")} className="shrink-0 rounded-lg lg:hidden">
          <LogoMark className="size-8" />
        </Link>
        <span className="truncate text-sm font-semibold text-navy lg:hidden">{title}</span>
        {dev && (
          <Link href="/settings#demo" className="hidden items-center gap-1.5 rounded-full border border-warn/40 bg-warn-light px-2.5 py-1 text-[11px] font-semibold text-warn-dark sm:inline-flex" title="Data is stored only in this browser. Connect the online database to share it with your household.">
            <FlaskConical className="size-3.5" /> {t("header.devMode")}
          </Link>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <CurrencySwitcher baseCurrency={baseCurrency} />
        <LanguageSwitcher />
      </div>

      {s.can("add_transactions") && (
        <>
          <Button variant="outline" size="sm" className="hidden xl:inline-flex" onClick={() => setReceipt(true)}>
            <ScanLine /> {t("header.uploadReceipt")}
          </Button>
          <Button size="sm" onClick={() => setQuickAdd(true)} aria-label={t("header.addTransaction")}>
            <Plus /> <span className="hidden md:inline">{t("header.addTransaction")}</span>
          </Button>
        </>
      )}

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="relative rounded-lg p-2 text-navy hover:bg-slate-100" aria-label={`${t("header.notifications")} (${unread.length})`}>
            <Bell className="size-5" />
            {unread.length > 0 && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white">{unread.length}</span>}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-[min(92vw,380px)] rounded-2xl border border-line bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-semibold">{t("header.notifications")}</p>
              {unread.length > 0 && (
                <button className="flex items-center gap-1 text-xs text-brand-dark hover:underline" onClick={() => void markAllRead()}>
                  <CheckCheck className="size-3.5" /> {t("header.markAllRead")}
                </button>
              )}
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {inApp.length === 0 && <p className="p-6 text-center text-sm text-muted">{t("header.caughtUp")}</p>}
              {inApp.slice(0, 20).map((n) => (
                <DropdownMenu.Item
                  key={n.id}
                  onSelect={() => {
                    if (!n.readAt) void run((api) => api.update("notifications", n.id, { readAt: new Date().toISOString() }));
                    if (n.actionHref) router.push(n.actionHref);
                  }}
                  className={cn("flex cursor-pointer gap-3 border-b border-line/60 px-4 py-3 outline-none last:border-0 data-[highlighted]:bg-slate-50", !n.readAt && "bg-brand-light/20")}
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEVERITY_STYLES[n.severity].bar)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-navy">{n.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">{n.body}</span>
                    <span className="mt-1 block text-[11px] text-slate-400">{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</span>
                  </span>
                </DropdownMenu.Item>
              ))}
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="flex size-9 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white" aria-label="Account menu">
            {initials(s.profile?.fullName ?? "?")}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-56 rounded-xl border border-line bg-white p-1 shadow-xl">
            <div className="px-3 py-2">
              <p className="text-sm font-medium">{s.profile?.fullName}</p>
              <p className="text-xs text-muted">{s.profile?.email}</p>
              {s.member && <Badge tone="gray" className="mt-1.5 capitalize">{s.member.role}</Badge>}
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-line" />
            <DropdownMenu.Item asChild className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-slate-50">
              <Link href="/settings"><SettingsIcon className="size-4" /> {t("header.settings")}</Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-slate-50">
              <Link href="/install"><Smartphone className="size-4" /> {t("install.menu")}</Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => void doLogout()} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger outline-none data-[highlighted]:bg-danger-light/50">
              <LogOut className="size-4" /> {t("header.signOut")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </header>
  );
}

export function useUnreadCount() {
  const notifications = useList("notifications");
  return (notifications.data ?? []).filter((n) => n.channel === "in_app" && !n.readAt).length;
}
