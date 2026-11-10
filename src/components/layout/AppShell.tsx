"use client";

import { FinanceProvider } from "@/hooks/use-finance";
import { AuthGate } from "./AuthGate";
import { GlobalDialogs } from "./GlobalDialogs";
import { Header, useUnreadCount } from "./Header";
import { MobileNavigation } from "./MobileNavigation";
import { NotificationSync } from "./NotificationSync";
import { Sidebar } from "./Sidebar";

function Shell({ children }: { children: React.ReactNode }) {
  const unread = useUnreadCount();
  return (
    <div className="flex min-h-dvh">
      <Sidebar unread={unread} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-10">{children}</main>
      </div>
      <MobileNavigation />
      <GlobalDialogs />
      <NotificationSync />
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
