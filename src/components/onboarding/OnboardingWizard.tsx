"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/inputs";
import { COUNTRIES, FINANCIAL_GOAL_OPTIONS, LANGUAGES } from "@/constants";
import { useSession } from "@/hooks/use-session";
import { formatMoney, SUPPORTED_CURRENCIES } from "@/lib/money";
import { cn } from "@/lib/utils";
import { completeOnboarding, type OnboardingData } from "@/services/onboarding.service";
import { useAuthStore } from "@/stores/auth.store";

const int = (msg = "Enter a number") => z.number({ message: msg }).int("Whole numbers only").min(0, "Can't be negative");

const schema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name"),
    age: z.number({ message: "Enter your age" }).int().min(13, "You must be at least 13").max(110),
    country: z.string().min(1),
    city: z.string().trim().min(2, "Enter your city"),
    language: z.string().min(1),
    currency: z.string().min(3),
    timezone: z.string().min(1),
    occupation: z.string().trim().min(2, "Enter your occupation"),
    employmentStatus: z.enum(["student", "employed", "self-employed", "unemployed"]),
    householdName: z.string().trim().max(60),
    householdSize: z.number({ message: "Enter a number" }).int().min(1, "At least 1").max(30),
    dependents: int().max(30),
    householdStatus: z.string().min(1),
    managesFinances: z.enum(["alone", "jointly"]),
    financialDependents: int().max(30),
    monthlyIncome: int(),
    incomeFrequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "yearly", "irregular", "once"]),
    additionalIncome: int(),
    additionalIncomeLabel: z.string().max(60),
    availableNow: int(),
    existingSavings: int(),
    monthlyRent: int(),
    debtObligations: int(),
    otherRecurringExpenses: int(),
    goals: z.array(z.string()),
    customGoal: z.string().max(60),
    monthlyBudget: z.number({ message: "Enter your monthly budget" }).int().min(1, "Set a monthly budget"),
    savingsTarget: int(),
    essentialAllocation: int(),
    flexibleAllocation: int(),
    planningApproach: z.enum(["50-30-20", "zero-based", "envelope", "custom"]),
    riskTolerance: z.enum(["low", "medium", "high"]),
  })
  .refine((v) => v.dependents < v.householdSize + 1, { message: "Dependents can't exceed household size", path: ["dependents"] })
  .refine((v) => v.essentialAllocation + v.flexibleAllocation <= v.monthlyBudget, { message: "Essential + flexible can't exceed the monthly budget", path: ["flexibleAllocation"] })
  .refine((v) => v.goals.length > 0 || v.customGoal.trim().length > 0, { message: "Pick at least one goal", path: ["goals"] });

type Values = z.infer<typeof schema>;

const STEPS: { title: string; description: string; fields: FieldPath<Values>[] }[] = [
  { title: "About you", description: "So advice fits your situation.", fields: ["fullName", "age", "country", "city", "language", "currency", "occupation", "employmentStatus"] },
  { title: "Your household", description: "Who you manage money for.", fields: ["householdName", "householdSize", "dependents", "householdStatus", "managesFinances", "financialDependents"] },
  { title: "Financial situation", description: "A starting picture — you can change everything later.", fields: ["monthlyIncome", "incomeFrequency", "additionalIncome", "additionalIncomeLabel", "availableNow", "existingSavings", "monthlyRent", "debtObligations", "otherRecurringExpenses"] },
  { title: "Your goals", description: "What are you saving or planning for?", fields: ["goals", "customGoal"] },
  { title: "Budget preferences", description: "How much to spend, and how much to keep.", fields: ["monthlyBudget", "savingsTarget", "essentialAllocation", "flexibleAllocation", "planningApproach", "riskTolerance"] },
];

export function OnboardingWizard() {
  const session = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const setHousehold = useAuthStore((s) => s.setHousehold);
  const joining = session.memberships.length > 0;
  const steps = joining ? STEPS.slice(0, 4) : STEPS;
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      fullName: session.profile?.fullName ?? "",
      age: undefined as unknown as number,
      country: "Rwanda",
      city: "Kigali",
      language: "English",
      currency: "RWF",
      timezone: "Africa/Kigali",
      occupation: "",
      employmentStatus: "employed",
      householdName: "",
      householdSize: 1,
      dependents: 0,
      householdStatus: "Single",
      managesFinances: "alone",
      financialDependents: 0,
      monthlyIncome: 0,
      incomeFrequency: "monthly",
      additionalIncome: 0,
      additionalIncomeLabel: "",
      availableNow: 0,
      existingSavings: 0,
      monthlyRent: 0,
      debtObligations: 0,
      otherRecurringExpenses: 0,
      goals: ["Emergency fund"],
      customGoal: "",
      monthlyBudget: joining ? 1 : 0,
      savingsTarget: 0,
      essentialAllocation: 0,
      flexibleAllocation: 0,
      planningApproach: "50-30-20",
      riskTolerance: "low",
    },
  });
  const { register, formState, watch, setValue, trigger, handleSubmit } = form;
  const e = formState.errors;
  const v = watch();
  const fmt = (n: number) => formatMoney(n || 0, v.currency || "RWF");
  const num = { valueAsNumber: true } as const;

  async function next() {
    const ok = await trigger(steps[step]!.fields);
    if (ok) setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  function suggest() {
    const income = (v.monthlyIncome || 0) + (v.additionalIncome || 0);
    if (!income) {
      toast.info("Add your income in step 3 to get a suggestion.");
      return;
    }
    const savings = Math.round((income * 0.2) / 1000) * 1000;
    const budget = income - savings;
    const essentials = Math.max(Math.round((income * 0.5) / 1000) * 1000, v.monthlyRent + v.debtObligations + v.otherRecurringExpenses);
    setValue("savingsTarget", savings, { shouldValidate: true });
    setValue("monthlyBudget", budget, { shouldValidate: true });
    setValue("essentialAllocation", Math.min(essentials, budget), { shouldValidate: true });
    setValue("flexibleAllocation", Math.max(0, budget - Math.min(essentials, budget)), { shouldValidate: true });
  }

  async function finish(values: Values) {
    if (!session.userId) return;
    setSaving(true);
    try {
      const householdId = await completeOnboarding(session.userId, values as OnboardingData);
      setHousehold(householdId);
      await qc.invalidateQueries();
      toast.success("Your household is ready.");
      router.replace("/overview");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const isLast = step === steps.length - 1;

  return (
    <div className="w-full max-w-2xl">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-brand-dark">Step {step + 1} of {steps.length}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{steps[step]!.title}</h1>
        <p className="text-sm text-muted">{steps[step]!.description}</p>
        {joining && step === 0 && <p className="mt-2 rounded-lg bg-brand-light px-3 py-2 text-xs text-brand-dark">You&apos;re joining an existing household. Its budget is managed by the owner, so we&apos;ll only ask about you.</p>}
        <ol className="mt-4 flex gap-1.5" aria-label="Progress">
          {steps.map((s, i) => (
            <li key={s.title} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-brand" : "bg-slate-200")} aria-current={i === step ? "step" : undefined}>
              <span className="sr-only">{s.title}{i < step ? " (done)" : ""}</span>
            </li>
          ))}
        </ol>
      </div>

      <Card className="p-5 sm:p-6">
        <form onSubmit={handleSubmit(finish)} noValidate>
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" error={e.fullName?.message} className="sm:col-span-2"><Input {...register("fullName")} autoComplete="name" /></Field>
              <Field label="Age" error={e.age?.message}><Input type="number" inputMode="numeric" {...register("age", num)} /></Field>
              <Field label="Country" error={e.country?.message}>
                <Select
                  {...register("country", {
                    onChange: (ev) => {
                      const c = COUNTRIES.find((c) => c.name === ev.target.value);
                      if (c) {
                        setValue("currency", c.currency);
                        setValue("timezone", c.timezone);
                      }
                    },
                  })}
                >
                  {COUNTRIES.map((c) => <option key={c.name}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="City" error={e.city?.message}><Input {...register("city")} /></Field>
              <Field label="Preferred language"><Select {...register("language")}>{LANGUAGES.map((l) => <option key={l}>{l}</option>)}</Select></Field>
              <Field label="Currency" hint="Default for Rwanda is RWF."><Select {...register("currency")}>{SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="Occupation" error={e.occupation?.message}><Input {...register("occupation")} placeholder="e.g. Teacher, Accountant, Student" /></Field>
              <Field label="Status" className="sm:col-span-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(["student", "employed", "self-employed", "unemployed"] as const).map((s) => (
                    <Choice key={s} active={v.employmentStatus === s} onClick={() => setValue("employmentStatus", s)} label={s === "employed" ? "Working professional" : s[0]!.toUpperCase() + s.slice(1)} />
                  ))}
                </div>
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {!joining && <Field label="Household name" hint="Optional — e.g. “Uwase Household”" className="sm:col-span-2"><Input {...register("householdName")} /></Field>}
              <Field label="People in the household" error={e.householdSize?.message}><Input type="number" inputMode="numeric" {...register("householdSize", num)} /></Field>
              <Field label="Dependents (children, elderly…)" error={e.dependents?.message}><Input type="number" inputMode="numeric" {...register("dependents", num)} /></Field>
              <Field label="People financially dependent on you" error={e.financialDependents?.message}><Input type="number" inputMode="numeric" {...register("financialDependents", num)} /></Field>
              <Field label="Household status"><Select {...register("householdStatus")}>{["Single", "Married", "Living with partner", "Single parent", "Lives with relatives", "Shared housing", "Prefer not to say"].map((o) => <option key={o}>{o}</option>)}</Select></Field>
              <Field label="Who manages the money?" className="sm:col-span-2">
                <div className="grid grid-cols-2 gap-2">
                  <Choice active={v.managesFinances === "alone"} onClick={() => setValue("managesFinances", "alone")} label="I manage it alone" />
                  <Choice active={v.managesFinances === "jointly"} onClick={() => setValue("managesFinances", "jointly")} label="Jointly with others" />
                </div>
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Main monthly income (${v.currency})`} error={e.monthlyIncome?.message}><Input type="number" inputMode="numeric" {...register("monthlyIncome", num)} /></Field>
              <Field label="How often is it paid?"><Select {...register("incomeFrequency")}>{[["monthly", "Monthly"], ["weekly", "Weekly"], ["biweekly", "Every 2 weeks"], ["irregular", "Irregular"], ["quarterly", "Quarterly"], ["yearly", "Yearly"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
              <Field label={`Additional income per month (${v.currency})`} error={e.additionalIncome?.message} hint="Side jobs, family support, allowance…"><Input type="number" inputMode="numeric" {...register("additionalIncome", num)} /></Field>
              <Field label="Additional income source"><Input {...register("additionalIncomeLabel")} placeholder="e.g. Freelance" /></Field>
              <Field label={`Money you had at the start of today (${v.currency})`} error={e.availableNow?.message} hint="Cash + MoMo + bank you can spend. You'll record today's spending next."><Input type="number" inputMode="numeric" {...register("availableNow", num)} /></Field>
              <Field label={`Existing savings (${v.currency})`} error={e.existingSavings?.message}><Input type="number" inputMode="numeric" {...register("existingSavings", num)} /></Field>
              <Field label={`Monthly rent (${v.currency})`} error={e.monthlyRent?.message}><Input type="number" inputMode="numeric" {...register("monthlyRent", num)} /></Field>
              <Field label={`Debt repayments per month (${v.currency})`} error={e.debtObligations?.message}><Input type="number" inputMode="numeric" {...register("debtObligations", num)} /></Field>
              <Field label={`Other recurring expenses (${v.currency})`} error={e.otherRecurringExpenses?.message} hint="Utilities, school fees, subscriptions…" className="sm:col-span-2"><Input type="number" inputMode="numeric" {...register("otherRecurringExpenses", num)} /></Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {FINANCIAL_GOAL_OPTIONS.map((g) => {
                  const on = v.goals.includes(g);
                  return <Choice key={g} active={on} onClick={() => setValue("goals", on ? v.goals.filter((x) => x !== g) : [...v.goals, g], { shouldValidate: true })} label={g} check />;
                })}
              </div>
              <Field label="Other goal" error={e.goals?.message}><Input {...register("customGoal")} placeholder="e.g. Buy a motorbike for deliveries" /></Field>
            </div>
          )}

          {step === 4 && !joining && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-light/60 p-3 text-sm">
                <span className="text-brand-dark">Monthly income: <strong className="money">{fmt((v.monthlyIncome || 0) + (v.additionalIncome || 0))}</strong></span>
                <Button type="button" size="sm" variant="soft" onClick={suggest}><Sparkles /> Suggest a budget</Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`Monthly spending budget (${v.currency})`} error={e.monthlyBudget?.message}><Input type="number" inputMode="numeric" {...register("monthlyBudget", num)} /></Field>
                <Field label={`Monthly savings target (${v.currency})`} error={e.savingsTarget?.message}><Input type="number" inputMode="numeric" {...register("savingsTarget", num)} /></Field>
                <Field label={`Essentials allocation (${v.currency})`} error={e.essentialAllocation?.message} hint="Food, rent, bills, health, school."><Input type="number" inputMode="numeric" {...register("essentialAllocation", num)} /></Field>
                <Field label={`Flexible allocation (${v.currency})`} error={e.flexibleAllocation?.message} hint="Eating out, entertainment, clothes."><Input type="number" inputMode="numeric" {...register("flexibleAllocation", num)} /></Field>
                <Field label="Planning approach">
                  <Select {...register("planningApproach")}>
                    <option value="50-30-20">50/30/20 — needs, wants, savings</option>
                    <option value="zero-based">Zero-based — every franc has a job</option>
                    <option value="envelope">Envelope — fixed amounts per category</option>
                    <option value="custom">My own way</option>
                  </Select>
                </Field>
                <Field label="Comfort with financial risk">
                  <Select {...register("riskTolerance")}>
                    <option value="low">Low — keep money safe</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </Select>
                </Field>
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}><ChevronLeft /> Back</Button>
            {isLast ? (
              <Button type="submit" loading={saving}><Check /> Finish setup</Button>
            ) : (
              <Button type="button" onClick={() => void next()}>Continue <ChevronRight /></Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}

function Choice({ active, onClick, label, check }: { active: boolean; onClick: () => void; label: string; check?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors", active ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white text-navy hover:border-slate-300")}
    >
      {check && <span className={cn("flex size-4 items-center justify-center rounded border", active ? "border-brand bg-brand text-white" : "border-slate-300")}>{active && <Check className="size-3" />}</span>}
      {label}
    </button>
  );
}
