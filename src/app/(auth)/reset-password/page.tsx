"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/inputs";
import { registerSchema } from "@/lib/validations";
import { changePassword, hasRecoverySession } from "@/services/auth.service";

export default function ResetPasswordPage() {
  const router = useRouter();
  const session = useQuery({ queryKey: ["recovery-session"], queryFn: hasRecoverySession, staleTime: 0, gcTime: 0 });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const check = registerSchema.shape.password.safeParse(password);
  const error = password && !check.success ? check.error.issues[0]?.message : confirm && confirm !== password ? "Passwords don't match" : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!check.success || confirm !== password) return;
    setBusy(true);
    try {
      await changePassword(password);
      toast.success("Password changed. You're signed in.");
      router.replace("/");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      {session.isLoading ? (
        <p className="mt-4 text-sm text-muted">Checking your link…</p>
      ) : !session.data ? (
        <>
          <p className="mt-2 text-sm text-muted">This reset link is invalid or has expired. Request a new one.</p>
          <Button asChild className="mt-6 w-full"><Link href="/forgot-password">Send a new link</Link></Button>
        </>
      ) : (
        <form className="mt-8 space-y-4" onSubmit={submit} noValidate>
          <Field label="New password" htmlFor="password" hint="At least 8 characters with a letter and a number."><Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Field label="Repeat new password" htmlFor="confirm" error={error}><Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          <Button type="submit" className="w-full" loading={busy} disabled={!check.success || confirm !== password}>Save new password</Button>
        </form>
      )}
    </div>
  );
}
