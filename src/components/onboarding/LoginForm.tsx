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
import { isDevDataMode } from "@/config/env";
import { DEMO_PASSWORD, DEMO_USERS } from "@/lib/data/seed";
import { loginSchema } from "@/lib/validations";
import { login } from "@/services/auth.service";
import { useAuthStore } from "@/stores/auth.store";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const setSession = useAuthStore((s) => s.setSession);
  const [busy, setBusy] = useState(false);
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  async function submit(values: z.infer<typeof loginSchema>) {
    setBusy(true);
    try {
      const r = await login(values.email, values.password);
      setSession(r.userId, r.householdId);
      await qc.invalidateQueries({ queryKey: ["session"] });
      const next = params.get("next");
      router.replace(!r.onboardingCompleted ? "/onboarding" : next && next.startsWith("/") && !next.startsWith("//") ? next : "/overview");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Sign in to your household.</p>
      <form className="mt-8 space-y-4" onSubmit={form.handleSubmit(submit)} noValidate>
        <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...form.register("email")} aria-invalid={!!form.formState.errors.email} />
        </Field>
        <Field label="Password" htmlFor="password" error={form.formState.errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} aria-invalid={!!form.formState.errors.password} />
        </Field>
        <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        New to Trust Manager? <Link className="font-medium text-brand-dark hover:underline" href="/register">Create an account</Link>
      </p>

      {isDevDataMode() && (
        <div className="mt-8 rounded-xl border border-warn/40 bg-warn-light/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-warn-dark">Development mode · sample household</p>
          <p className="mt-1 text-xs text-warn-dark/80">Try the demo as different household roles (password: {DEMO_PASSWORD}).</p>
          <div className="mt-3 grid gap-2">
            {[
              { u: DEMO_USERS.owner, role: "Owner — full access" },
              { u: DEMO_USERS.admin, role: "Administrator" },
              { u: DEMO_USERS.contributor, role: "Contributor — groceries only, no balances" },
            ].map(({ u, role }) => (
              <button
                key={u.id}
                type="button"
                className="rounded-lg border border-warn/30 bg-white px-3 py-2 text-left text-xs hover:border-warn"
                onClick={() => void submit({ email: u.email, password: DEMO_PASSWORD })}
              >
                <span className="font-semibold text-navy">{u.name}</span> <span className="text-muted">· {role}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
