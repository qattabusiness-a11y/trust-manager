"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/hooks/use-session";
import { LogoMark } from "./Logo";

type Mode = "root" | "guest" | "onboarding" | "app";

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
  if (!s.loading && !s.error) {
    if (mode === "root") target = !signedIn ? "/login" : onboarded ? "/overview" : "/onboarding";
    if (mode === "guest" && signedIn) target = onboarded ? "/overview" : "/onboarding";
    if (mode === "onboarding" && !signedIn) target = "/login";
    if (mode === "onboarding" && signedIn && onboarded) target = "/overview";
    if (mode === "app" && !signedIn) target = `/login?next=${encodeURIComponent(pathname)}`;
    if (mode === "app" && signedIn && !onboarded) target = "/onboarding";
  }

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (s.error) return <ConnectionError error={s.error} />;
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

function ConnectionError({ error }: { error: unknown }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4" role="alert">
      <div className="max-w-md rounded-2xl border border-danger/30 bg-white p-6 text-center shadow-sm">
        <LogoMark className="mx-auto size-12" />
        <p className="mt-4 font-semibold text-navy">Trust Manager couldn&apos;t connect to its database.</p>
        <p className="mt-2 text-sm text-muted">{error instanceof Error ? error.message : "Unknown error."}</p>
        <p className="mt-2 text-xs text-muted">Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, then restart the app.</p>
        <button className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white" onClick={() => window.location.reload()}>Try again</button>
      </div>
    </div>
  );
}
