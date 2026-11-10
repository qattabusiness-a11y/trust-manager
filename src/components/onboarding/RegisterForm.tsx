"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/inputs";
import { registerSchema } from "@/lib/validations";
import { register as registerUser } from "@/services/auth.service";
import { useAuthStore } from "@/stores/auth.store";

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const setSession = useAuthStore((s) => s.setSession);
  const [busy, setBusy] = useState(false);
  const invitedEmail = params.get("email") ?? "";
  const form = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema), defaultValues: { fullName: "", email: invitedEmail, password: "" } });
  const e = form.formState.errors;

  async function submit(values: z.infer<typeof registerSchema>) {
    setBusy(true);
    try {
      const r = await registerUser(values.fullName, values.email, values.password);
      setSession(r.userId, null);
      await qc.invalidateQueries({ queryKey: ["session"] });
      const invite = params.get("invite");
      router.replace(invite ? `/invite/${encodeURIComponent(invite)}` : "/onboarding");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-muted">Next, we&apos;ll set up your household profile — it takes about 3 minutes.</p>
      <form className="mt-8 space-y-4" onSubmit={form.handleSubmit(submit)} noValidate>
        <Field label="Full name" htmlFor="fullName" error={e.fullName?.message}>
          <Input id="fullName" autoComplete="name" {...form.register("fullName")} aria-invalid={!!e.fullName} />
        </Field>
        <Field label="Email" htmlFor="email" error={e.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...form.register("email")} aria-invalid={!!e.email} />
        </Field>
        <Field label="Password" htmlFor="password" error={e.password?.message} hint="At least 8 characters with a letter and a number.">
          <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} aria-invalid={!!e.password} />
        </Field>
        <Button type="submit" className="w-full" loading={busy}>Create account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account? <Link className="font-medium text-brand-dark hover:underline" href="/login">Sign in</Link>
      </p>
    </div>
  );
}
