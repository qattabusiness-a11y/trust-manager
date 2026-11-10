"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { IncomeManager } from "@/components/budget/IncomeManager";
import { HardStopBanner } from "@/components/dashboard/HardStopBanner";
import { ErrorState, LoadingState, NoAccess, PageHeader, StatusBadge, statusBar } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/inputs";
import { Progress } from "@/components/ui/misc";
import { DEFAULT_THRESHOLDS } from "@/constants";
import { useAction } from "@/hooks/use-data";
import { useFinance } from "@/hooks/use-finance";
import { baseLimits, type PeriodUsage } from "@/lib/calculations/budget";
import { daysInCurrentMonth, fmtLocalDate } from "@/lib/dates";
import { budgetSchema } from "@/lib/validations";
import { saveBudget } from "@/services/budget.service";

type Values = z.input<typeof budgetSchema>;

export default function BudgetPage() {
  const f = useFinance();
  const { run, pending } = useAction();
  const s = f.snapshot;
  const b = f.budget;
  const form = useForm<Values>({ resolver: zodResolver(budgetSchema) });
  const tz = s.tz;

  useEffect(() => {
    if (f.loading) return;
    form.reset({
      monthlyBudget: b?.monthlyBudget ?? (undefined as unknown as number),
      savingsTarget: b?.savingsTarget ?? 0,
      essentialAllocation: b?.essentialAllocation ?? 0,
      flexibleAllocation: b?.flexibleAllocation ?? 0,
      customDailyLimit: b?.customDailyLimit ?? null,
      customWeeklyLimit: b?.customWeeklyLimit ?? null,
      caution: b?.thresholds.caution ?? DEFAULT_THRESHOLDS.caution,
      warning: b?.thresholds.warning ?? DEFAULT_THRESHOLDS.warning,
      critical: b?.thresholds.critical ?? DEFAULT_THRESHOLDS.critical,
    });
  }, [b, f.loading, form]);

  if (f.loading) return <LoadingState rows={5} />;
  if (f.error) return <ErrorState error={f.error} />;
  if (!f.can("view_budget")) return <NoAccess what="the household budget" />;

  const canManage = f.can("manage_budget");
  const monthly = form.watch("monthlyBudget") || 0;
  const preview = baseLimits(monthly, daysInCurrentMonth(tz));
  const nullableNum = { setValueAs: (v: string) => (v === "" || v == null ? null : Number(v)) };
  const num = { valueAsNumber: true } as const;
  const e = form.formState.errors;

  async function submit(values: Values) {
    await run((api) => saveBudget(api, f.budgetIsCurrentMonth ? b : null, budgetSchema.parse(values), tz), "Budget saved. Limits and alerts updated.");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My Budget" description="Your monthly plan, broken down into weekly and daily limits you can actually follow." />
      <HardStopBanner s={s} />
      {b && !f.budgetIsCurrentMonth && (
        <p className="flex items-center gap-2 rounded-xl bg-warn-light px-4 py-3 text-sm text-warn-dark"><Info className="size-4" /> Using last month&apos;s budget ({fmtLocalDate(`${b.month}-01`, "MMMM")}). Save below to set this month&apos;s budget.</p>
      )}

      {s.budget && (
        <div className="grid gap-4 md:grid-cols-3">
          <UsageCard title="Today" u={s.budget.day} fmt={s.fmt} extra={`Recommended for the rest of the month: ${s.fmt(s.budget.recommendedDaily)}/day`} />
          <UsageCard title="This week (Mon–Sun)" u={s.budget.week} fmt={s.fmt} />
          <UsageCard title="This month" u={s.budget.month} fmt={s.fmt} extra={`${s.budget.daysLeft} days left`} />
          <UsageCard title="Essentials" u={s.budget.essentialUsage} fmt={s.fmt} />
          <UsageCard title="Flexible spending" u={s.budget.flexibleUsage} fmt={s.fmt} />
          <Card className="p-5">
            <p className="text-xs font-medium text-muted">Fixed obligations</p>
            <p className="money mt-2 text-xl font-semibold">{s.fmt(s.budget.fixedObligations)}<span className="text-sm font-normal text-muted">/month</span></p>
            <p className="mt-1 text-xs text-muted">Bills, loans and subscriptions (monthly equivalent). {s.fmt(s.upcomingObligations30)} due in the next 30 days.</p>
          </Card>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly budget</CardTitle>
            <CardDescription>Weekly limit = monthly × 12 ÷ 52. Daily limit = monthly ÷ days in this month ({daysInCurrentMonth(tz)}).</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={form.handleSubmit(submit)} noValidate>
              <fieldset disabled={!canManage} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={`Monthly spending budget (${s.currency})`} error={e.monthlyBudget?.message}><Input type="number" inputMode="numeric" {...form.register("monthlyBudget", num)} /></Field>
                  <Field label="Monthly savings target" error={e.savingsTarget?.message}><Input type="number" inputMode="numeric" {...form.register("savingsTarget", num)} /></Field>
                  <Field label="Essentials allocation" error={e.essentialAllocation?.message}><Input type="number" inputMode="numeric" {...form.register("essentialAllocation", num)} /></Field>
                  <Field label="Flexible allocation" error={e.flexibleAllocation?.message}><Input type="number" inputMode="numeric" {...form.register("flexibleAllocation", num)} /></Field>
                </div>
                <div className="rounded-xl border border-line p-4">
                  <p className="text-sm font-medium">Daily & weekly limits</p>
                  <p className="text-xs text-muted">Leave blank to use the automatic values. Custom limits must still fit inside the monthly budget.</p>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field label="Custom weekly limit" hint={`Automatic: ${s.fmt(preview.weekly)}`} error={e.customWeeklyLimit?.message}><Input type="number" inputMode="numeric" placeholder={String(preview.weekly)} {...form.register("customWeeklyLimit", nullableNum)} /></Field>
                    <Field label="Custom daily limit" hint={`Automatic: ${s.fmt(preview.daily)}`} error={e.customDailyLimit?.message}><Input type="number" inputMode="numeric" placeholder={String(preview.daily)} {...form.register("customDailyLimit", nullableNum)} /></Field>
                  </div>
                </div>
                <div className="rounded-xl border border-line p-4">
                  <p className="text-sm font-medium">Alert thresholds (% of a limit used)</p>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <Field label="Caution from" error={e.caution?.message}><Input type="number" {...form.register("caution", num)} /></Field>
                    <Field label="Warning from" error={e.warning?.message}><Input type="number" {...form.register("warning", num)} /></Field>
                    <Field label="Critical from" error={e.critical?.message}><Input type="number" {...form.register("critical", num)} /></Field>
                  </div>
                  <p className="mt-2 text-xs text-muted">Below caution is healthy. Defaults: 70%, 85%, 100%.</p>
                </div>
              </fieldset>
              {canManage ? <div className="flex justify-end"><Button type="submit" loading={pending}>Save budget</Button></div> : <p className="text-xs text-muted">Only members who can manage budgets can change these values.</p>}
            </form>
          </CardContent>
        </Card>
        <IncomeManager income={f.data.income} fmt={s.fmt} tz={tz} />
      </div>
    </div>
  );
}

function UsageCard({ title, u, fmt, extra }: { title: string; u: PeriodUsage; fmt: (n: number) => string; extra?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted">{title}</p>
        <StatusBadge status={u.status} />
      </div>
      <p className="money mt-2 text-xl font-semibold">{u.over ? <span className="text-danger">{fmt(u.over)} over</span> : <>{fmt(u.remaining)} <span className="text-sm font-normal text-muted">left</span></>}</p>
      <Progress value={u.usedPct} tone={statusBar(u.status)} className="mt-3" label={`${title} used`} />
      <p className="mt-2 text-xs text-muted">{fmt(u.spent)} of {fmt(u.limit)} · {Math.round(u.usedPct)}%</p>
      {extra && <p className="mt-1 text-xs text-muted">{extra}</p>}
    </Card>
  );
}
