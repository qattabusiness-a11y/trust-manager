"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/hooks/use-session";
import { LogoMark } from "./Logo";

type Mode = "guest" | "onboarding" | "app";

/**
 * Route guard. Onboarding is mandatory: a signed-in user without a completed
 * profile is always sent to /onboarding and cannot reach the dashboard.
 */
export function AuthGate({ mode, children }: { mode: Mode; children: React.ReactNode }) {
  const s = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const signedIn = !!s.userId && !!s.profile;
  const onboarded = !!s.profile?.onboardingCompleted && !!s.member;

  let target: string | null = null;
  if (!s.loading) {
    if (mode === "guest" && signedIn) target = onboarded ? "/overview" : "/onboarding";
    if (mode === "onboarding" && !signedIn) target = "/login";
    if (mode === "onboarding" && signedIn && onboarded) target = "/overview";
    if (mode === "app" && !signedIn) target = `/login?next=${encodeURIComponent(pathname)}`;
    if (mode === "app" && signedIn && !onboarded) target = "/onboarding";
  }

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (s.loading || target) return <Splash />;
  return <>{children}</>;
}

export function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas" aria-busy="true">
      <div className="flex flex-col items-center gap-3 text-navy">
        <LogoMark className="size-16 animate-pulse" />
        <p className="text-sm text-muted">Loading your household…</p>
      </div>
    </div>
  );
}
