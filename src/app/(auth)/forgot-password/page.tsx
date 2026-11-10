"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/inputs";
import { requestPasswordReset } from "@/services/auth.service";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return void toast.error("Enter a valid email address.");
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      {sent ? (
        <div className="text-center">
          <MailCheck className="mx-auto size-10 text-brand" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Check your email</h1>
          <p className="mt-2 text-sm text-muted">If an account exists for {email.trim()}, we&apos;ve sent a link to choose a new password. It can take a few minutes — check your spam folder too.</p>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
          <p className="mt-1 text-sm text-muted">Enter your email and we&apos;ll send you a link to choose a new one.</p>
          <form className="mt-8 space-y-4" onSubmit={submit} noValidate>
            <Field label="Email" htmlFor="email"><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Button type="submit" className="w-full" loading={busy}>Send reset link</Button>
          </form>
        </>
      )}
      <p className="mt-6 text-center text-sm text-muted"><Link className="font-medium text-brand-dark hover:underline" href="/login">Back to sign in</Link></p>
    </div>
  );
}
