"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { LogoFull } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/constants";
import { useNow } from "@/hooks/use-now";
import { useSession } from "@/hooks/use-session";
import { acceptInvitation, lookupInvitation } from "@/services/auth.service";
import { useAuthStore } from "@/stores/auth.store";
import type { HouseholdRole } from "@/types";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const session = useSession();
  const setHousehold = useAuthStore((s) => s.setHousehold);
  const [busy, setBusy] = useState(false);
  const now = useNow();
  const inv = useQuery({ queryKey: ["invite", token], queryFn: () => lookupInvitation(token) });

  const expired = inv.data && new Date(inv.data.expiresAt).getTime() < now;
  const usable = inv.data && inv.data.status === "pending" && !expired;

  async function accept() {
    if (!session.userId) return;
    setBusy(true);
    try {
      const householdId = await acceptInvitation(token, session.userId);
      setHousehold(householdId);
      await qc.invalidateQueries();
      toast.success(`You joined ${inv.data?.householdName}.`);
      router.replace(session.profile?.onboardingCompleted ? "/overview" : "/onboarding");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-canvas px-4">
      <LogoFull className="w-40" />
      <Card className="w-full max-w-md p-6 text-center">
        <MailCheck className="mx-auto size-10 text-brand" />
        {inv.isLoading || session.loading ? (
          <p className="mt-4 text-sm text-muted">Checking your invitation…</p>
        ) : !inv.data ? (
          <p className="mt-4 text-sm text-navy">This invitation link is not valid. Ask the household owner for a new one.</p>
        ) : !usable ? (
          <p className="mt-4 text-sm text-navy">This invitation is {expired ? "expired" : inv.data.status}. Ask the household owner for a new one.</p>
        ) : (
          <>
            <h1 className="mt-4 text-xl font-semibold">Join {inv.data.householdName}</h1>
            <p className="mt-2 text-sm text-muted">
              You&apos;re invited as <strong className="text-navy">{ROLE_LABELS[inv.data.role as HouseholdRole]}</strong>. {ROLE_DESCRIPTIONS[inv.data.role as HouseholdRole]}
            </p>
            <p className="mt-1 text-xs text-muted">Sent to {inv.data.email} · expires {new Date(inv.data.expiresAt).toLocaleDateString()}</p>
            {session.userId ? (
              <Button className="mt-6 w-full" loading={busy} onClick={() => void accept()}>Accept invitation</Button>
            ) : (
              <div className="mt-6 grid gap-2">
                <Button asChild><Link href={`/register?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(inv.data.email)}`}>Create an account to join</Link></Button>
                <Button asChild variant="outline"><Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>I already have an account</Link></Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
