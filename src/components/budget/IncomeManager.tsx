"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/inputs";
import { Badge } from "@/components/ui/misc";
import { ConfirmDialog, EmptyState, NoAccess, Stat } from "@/components/shared";
import { useAction } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { incomeSummary, monthlyIncomeEquivalent } from "@/lib/calculations/insights";
import { fmtLocalDate, todayLocal } from "@/lib/dates";
import { incomeSourceSchema } from "@/lib/validations";
import type { IncomeSource } from "@/types";

const FREQ: Record<IncomeSource["frequency"], string> = { weekly: "Weekly", biweekly: "Every 2 weeks", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly", irregular: "Irregular", once: "One-time" };
const CATS: Record<IncomeSource["category"], string> = { salary: "Salary", freelance: "Freelancing", business: "Business income", allowance: "Allowance", family_support: "Family support", other: "Other income" };

type FormValues = z.input<typeof incomeSourceSchema>;

export function IncomeManager({ income, fmt, tz }: { income: IncomeSource[]; fmt: (n: number) => string; tz: string }) {
  const s = useSession();
  const { run, pending } = useAction();
  const [editing, setEditing] = useState<IncomeSource | "new" | null>(null);
  const [removing, setRemoving] = useState<IncomeSource | null>(null);
  if (!s.can("view_income")) return <NoAccess what="household income" />;
  const sum = incomeSummary(income);
  const canManage = s.can("manage_income");

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Income sources</CardTitle>
          <CardDescription>Savings allocations are part of income, not extra income — nothing is counted twice.</CardDescription>
        </div>
        {canManage && <Button size="sm" onClick={() => setEditing("new")}><Plus /> Add income</Button>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4">
          <Stat label="Total monthly income" value={fmt(sum.totalMonthly)} />
          <Stat label="Allocated to savings" value={fmt(sum.allocatedToSavings)} tone="green" />
          <Stat label="Available after savings" value={fmt(sum.availableAfterSavings)} />
        </div>
        {income.length === 0 ? (
          <EmptyState title="No income sources yet" description="Add your salary, business income, allowance or family support." />
        ) : (
          <ul className="divide-y divide-line">
            {income.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{i.name}</p>
                  <p className="text-xs text-muted">{CATS[i.category]} · {FREQ[i.frequency]} · {i.recurring ? `next around ${fmtLocalDate(i.expectedDate, "d MMM")}` : "not recurring"}{i.savingsAllocation ? ` · ${fmt(i.savingsAllocation)} to savings` : ""}</p>
                </div>
                <div className="text-right">
                  <p className="money text-sm font-semibold">{fmt(i.amount)}</p>
                  {i.frequency !== "monthly" && i.frequency !== "once" && <p className="text-[11px] text-muted">≈ {fmt(monthlyIncomeEquivalent(i))}/month</p>}
                  {i.frequency === "irregular" && <Badge tone="yellow">Not used in forecasts</Badge>}
                </div>
                {canManage && (
                  <div className="flex">
                    <Button size="icon-sm" variant="ghost" onClick={() => setEditing(i)} aria-label={`Edit ${i.name}`}><Pencil /></Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => setRemoving(i)} aria-label={`Delete ${i.name}`}><Trash2 /></Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? "Add income source" : "Edit income source"}>
          {editing && (
            <IncomeForm
              initial={editing === "new" ? null : editing}
              tz={tz}
              pending={pending}
              onSubmit={async (v) => {
                const values = incomeSourceSchema.parse(v);
                await run(
                  (api) =>
                    editing === "new"
                      ? api.create("incomeSources", { householdId: api.actor.householdId!, ownerUserId: api.actor.userId, ...values })
                      : api.update("incomeSources", editing.id, values),
                  "Income saved.",
                );
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        description="Past income transactions stay recorded. Forecasts will stop expecting this income."
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          await run((api) => api.remove("incomeSources", removing!.id), "Income source removed.");
          setRemoving(null);
        }}
      />
    </Card>
  );
}

function IncomeForm({ initial, onSubmit, pending, tz }: { initial: IncomeSource | null; onSubmit: (v: FormValues) => Promise<void>; pending: boolean; tz: string }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(incomeSourceSchema),
    defaultValues: initial ?? { name: "", amount: undefined as unknown as number, category: "salary", frequency: "monthly", expectedDate: todayLocal(tz), recurring: true, savingsAllocation: 0, notes: "" },
  });
  const e = form.formState.errors;
  const num = { valueAsNumber: true } as const;
  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Income name" error={e.name?.message} className="sm:col-span-2"><Input {...form.register("name")} placeholder="e.g. Salary — Aline" /></Field>
        <Field label="Amount per payment" error={e.amount?.message}><Input type="number" inputMode="numeric" {...form.register("amount", num)} /></Field>
        <Field label="Category"><Select {...form.register("category")}>{Object.entries(CATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Frequency"><Select {...form.register("frequency")}>{Object.entries(FREQ).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Expected payment date" error={e.expectedDate?.message}><Input type="date" {...form.register("expectedDate")} /></Field>
        <Field label="Amount set aside for savings" error={e.savingsAllocation?.message} hint="Moved to savings when this income arrives." className="sm:col-span-2"><Input type="number" inputMode="numeric" {...form.register("savingsAllocation", num)} /></Field>
      </div>
      <Switch checked={!!form.watch("recurring")} onChange={(v) => form.setValue("recurring", v)} label="Recurring" description="Comes in regularly on this schedule." />
      <Field label="Notes"><Textarea rows={2} {...form.register("notes")} /></Field>
      <div className="flex justify-end"><Button type="submit" loading={pending}>Save income</Button></div>
    </form>
  );
}
