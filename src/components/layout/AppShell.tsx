"use client";

import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { FinanceProvider, useFinance } from "@/hooks/use-finance";
import { AuthGate } from "./AuthGate";
import { ConversionBanner } from "./DisplaySettings";
import { GlobalDialogs } from "./GlobalDialogs";
import { Header, useUnreadCount } from "./Header";
import { MobileNavigation } from "./MobileNavigation";
import { NotificationSync } from "./NotificationSync";
import { Sidebar } from "./Sidebar";

function Shell({ children }: { children: React.ReactNode }) {
  const unread = useUnreadCount();
  const f = useFinance();
  const base = f.household?.currency ?? "RWF";
  const display = f.display;
  return (
    // Re-render every amount when the display currency or rate changes.
    <div key={display.key} className="flex min-h-dvh">
      <Sidebar unread={unread} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header baseCurrency={base} />
        {display.active && <ConversionBanner base={base} target={display.active.target} rate={display.active.rate} />}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-10">{children}</main>
      </div>
      <MobileNavigation />
      <GlobalDialogs />
      <NotificationSync />
      <AssistantWidget />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate mode="app">
      <FinanceProvider>
        <Shell>{children}</Shell>
      </FinanceProvider>
    </AuthGate>
  );
}
