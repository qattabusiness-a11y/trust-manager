"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDownToLine, Coins, Plus, Target } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { SavingsGrowthChart } from "@/components/analytics/charts";
import { EmptyState, ErrorState, LoadingState, NoAccess, PageHeader, SimulatedBadge, Stat } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/inputs";
import { Badge, Progress } from "@/components/ui/misc";
import { useAction, useList } from "@/hooks/use-data";
import { useFinance } from "@/hooks/use-finance";
import { useNow } from "@/hooks/use-now";
import { goalBalance } from "@/lib/calculations/balance";
import { microSavingsTotals, sweepSuggestions } from "@/lib/calculations/insights";
import { fmtDate, fmtLocalDate } from "@/lib/dates";
import { goalSchema } from "@/lib/validations";
import { pct } from "@/lib/utils";
import { savingsTransferService } from "@/services/savings.service";
import type { SavingsGoal } from "@/types";

type GoalValues = z.input<typeof goalSchema>;

export default function SavingsPage() {
  const f = useFinance();
  const prefsQ = useList("preferences");
  const { run, pending } = useAction();
  const [newGoal, setNewGoal] = useState(false);
  const [moving, setMoving] = useState<{ goal: SavingsGoal; direction: "deposit" | "withdraw" } | null>(null);
  const [custom, setCustom] = useState("");
  const now = useNow();
  const s = f.snapshot;

  if (f.loading || prefsQ.isLoading) return <LoadingState rows={5} />;
  if (f.error) return <ErrorState error={f.error} />;
  if (!f.can("view_balances")) return <NoAccess what="savings and balances" />;

  const prefs = prefsQ.data?.[0] ?? null;
  const increment = prefs?.roundingIncrement ?? 500;
  const canManage = f.can("manage_savings");
  const accounts = f.data.savingsAccounts;
  const opening = new Map(accounts.map((a) => [a.id, a.openingBalance]));
  const microAccount = accounts.find((a) => a.kind === "micro") ?? accounts[0];
  const since = new Date(now - 30 * 86_400_000);
  const suggestions = sweepSuggestions(f.data.transactions, f.data.contributions, increment, since);
  const micro = microSavingsTotals(f.data.contributions, s.tz);
  const target = f.budget?.savingsTarget ?? 0;

  async function sweep(ids: string[]) {
    if (!microAccount) return toast.error("Create a savings account first.");
    const chosen = suggestions.filter((x) => ids.includes(x.transactionId));
    await run(async (api) => {
      for (const c of chosen) {
        await savingsTransferService.transfer(api, { amount: c.spare, accountId: microAccount.id, goalId: null, source: "micro_sweep", note: `Round-up of ${c.title}`, relatedTransactionId: c.transactionId });
      }
    }, `${s.fmt(chosen.reduce((x, c) => x + c.spare, 0))} swept to your spare change jar (simulated — no real money moved).`);
  }

  async function setPrefs(patch: Partial<NonNullable<typeof prefs>>) {
    if (!prefs) return;
    await run((api) => api.update("preferences", prefs.id, patch), "Preference saved.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Savings & Wealth"
        description="Your reserves, goals and spare-change savings."
        actions={canManage && <Button onClick={() => setNewGoal(true)}><Plus /> Create goal</Button>}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-5"><Stat label="Total savings" value={s.fmt(s.savings)} tone="green" /></Card>
        <Card className="p-5">
          <Stat label="Saved this month" value={s.fmt(s.savingsThisMonth)} sub={target ? `${Math.round(pct(s.savingsThisMonth, target))}% of ${s.fmt(target)} target` : "No target set"} />
          {target > 0 && <Progress value={pct(s.savingsThisMonth, target)} className="mt-2" />}
        </Card>
        <Card className="p-5"><Stat label="Spare change saved" value={s.fmt(micro.accumulated)} sub={`${s.fmt(micro.thisMonth)} this month`} /></Card>
        <Card className="p-5"><Stat label="Accounts" value={`${accounts.length}`} sub={accounts.map((a) => a.name).join(", ")} /></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Savings goals</CardTitle><CardDescription>Contributions move money out of your available balance into savings inside Trust Manager.</CardDescription></CardHeader>
        <CardContent>
          {f.data.savingsGoals.length === 0 ? (
            <EmptyState icon={Target} title="No goals yet" description="Create a goal like an emergency fund, school fees or a laptop." action={canManage ? <Button onClick={() => setNewGoal(true)}><Plus /> Create goal</Button> : undefined} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {f.data.savingsGoals.map((g) => {
                const saved = goalBalance(g.id, opening.get(g.accountId) ?? 0, f.data.contributions);
                const p = pct(saved, g.targetAmount);
                return (
                  <div key={g.id} className="rounded-2xl border border-line p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{g.name}</p>
                        <p className="text-xs text-muted">{g.targetDate ? `Target date ${fmtLocalDate(g.targetDate, "d MMM yyyy")}` : "No target date"} · {g.priority} priority</p>
                      </div>
                      <Badge tone={g.status === "achieved" || p >= 100 ? "green" : "gray"}>{p >= 100 ? "Achieved" : g.status}</Badge>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                      <p className="money text-xl font-semibold text-brand-dark">{s.fmt(saved)}</p>
                      <p className="text-xs text-muted">of {s.fmt(g.targetAmount)} · {s.fmt(Math.max(0, g.targetAmount - saved))} remaining</p>
                    </div>
                    <Progress value={p} className="mt-2 h-2.5" label={`${g.name} progress`} />
                    {canManage && (
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="soft" onClick={() => setMoving({ goal: g, direction: "deposit" })}><Plus /> Add money</Button>
                        <Button size="sm" variant="ghost" onClick={() => setMoving({ goal: g, direction: "withdraw" })} disabled={saved <= 0}><ArrowDownToLine /> Withdraw</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Coins className="size-4 text-warn" /> Micro-savings sweeps</CardTitle>
            <CardDescription>Round purchases up and save the spare change. Example: {s.fmt(1850)} → {s.fmt(2000)} saves {s.fmt(150)}.</CardDescription>
            <div className="mt-1"><SimulatedBadge /></div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Round up to the next">
                <Select value={[100, 500, 1000].includes(increment) ? String(increment) : "custom"} onChange={(e) => e.target.value !== "custom" && void setPrefs({ roundingIncrement: Number(e.target.value) })} disabled={!prefs}>
                  <option value="100">{s.fmt(100)}</option><option value="500">{s.fmt(500)}</option><option value="1000">{s.fmt(1000)}</option><option value="custom">Custom{![100, 500, 1000].includes(increment) ? ` (${s.fmt(increment)})` : ""}</option>
                </Select>
              </Field>
              <Input className="w-28" type="number" placeholder="Custom" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom increment" />
              <Button variant="outline" size="sm" className="h-10" onClick={() => { const n = Number(custom); if (n > 0) void setPrefs({ roundingIncrement: Math.round(n) }); }}>Set</Button>
            </div>
            <Switch
              checked={!!prefs?.autoSweep}
              disabled={!prefs || !canManage}
              onChange={(v) => void setPrefs({ autoSweep: v, autoSweepSince: v ? new Date().toISOString() : null })}
              label="Automatic round-up rule"
              description={`When on, every new expense you record from now on is rounded up to the next ${s.fmt(increment)} and the difference is recorded as saved. It never moves real MoMo or bank money — you transfer it yourself.`}
            />
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted">No round-ups waiting from the last 30 days.</p>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-xl bg-warn-light/50 px-3 py-2 text-sm">
                  <span>{suggestions.length} purchases · <strong className="money">{s.fmt(suggestions.reduce((x, c) => x + c.spare, 0))}</strong> spare change</span>
                  {canManage && <Button size="sm" onClick={() => void sweep(suggestions.map((x) => x.transactionId))} loading={pending}>Approve all</Button>}
                </div>
                <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                  {suggestions.map((x) => (
                    <li key={x.transactionId} className="flex items-center gap-3 py-2 text-sm">
                      <div className="min-w-0 flex-1"><p className="truncate">{x.title}</p><p className="text-xs text-muted">{fmtDate(x.occurredAt, s.tz, "d MMM")}</p></div>
                      <span className="money text-xs text-muted">{s.fmt(x.amount)} → {s.fmt(x.rounded)}</span>
                      <span className="money w-20 text-right font-medium text-brand-dark">+{s.fmt(x.spare)}</span>
                      {canManage && <Button size="sm" variant="ghost" onClick={() => void sweep([x.transactionId])}>Sweep</Button>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Savings growth</CardTitle><CardDescription>Total across all savings accounts.</CardDescription></CardHeader>
          <CardContent>
            <SavingsGrowthChart data={s.savingsGrowth} currency={s.currency} height={260} />
            <ul className="mt-4 divide-y divide-line text-sm">
              {accounts.map((a) => {
                const bal = a.openingBalance + f.data.contributions.filter((c) => c.accountId === a.id).reduce((x, c) => x + c.amount, 0);
                return <li key={a.id} className="flex justify-between py-2"><span>{a.name}</span><span className="money font-medium">{s.fmt(bal)}</span></li>;
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Dialog open={newGoal} onOpenChange={setNewGoal}>
        <DialogContent title="Create a savings goal">
          <GoalForm
            pending={pending}
            onSubmit={async (raw) => {
              const v = goalSchema.parse(raw);
              await run(async (api) => {
                const acc = await api.create("savingsAccounts", { householdId: api.actor.householdId!, name: `${v.name} fund`, kind: "goal", openingBalance: v.startingAmount });
                await api.create("savingsGoals", { householdId: api.actor.householdId!, name: v.name, targetAmount: v.targetAmount, targetDate: v.targetDate, accountId: acc.id, priority: v.priority, status: "active", visionEntryId: null });
              }, "Goal created.");
              setNewGoal(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!moving} onOpenChange={(o) => !o && setMoving(null)}>
        <DialogContent title={moving?.direction === "withdraw" ? `Withdraw from ${moving.goal.name}` : `Add to ${moving?.goal.name}`} description="Recorded in Trust Manager only. Make the actual MoMo or bank transfer yourself.">
          {moving && <MoveForm fmt={s.fmt} available={s.balance} withdraw={moving.direction === "withdraw"} pending={pending} onSubmit={async (amount) => {
            const r = await run((api) => savingsTransferService.transfer(api, { amount, accountId: moving.goal.accountId, goalId: moving.goal.id, source: "manual", direction: moving.direction }));
            toast.success(r.message, { description: `Reference ${r.reference}` });
            setMoving(null);
          }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GoalForm({ onSubmit, pending }: { onSubmit: (v: GoalValues) => Promise<void>; pending: boolean }) {
  const form = useForm<GoalValues>({ resolver: zodResolver(goalSchema), defaultValues: { name: "", targetAmount: undefined as unknown as number, targetDate: null, priority: "medium", startingAmount: 0 } });
  const e = form.formState.errors;
  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <Field label="Goal name" error={e.name?.message}><Input {...form.register("name")} placeholder="e.g. School fees for January" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Target amount" error={e.targetAmount?.message}><Input type="number" inputMode="numeric" {...form.register("targetAmount", { valueAsNumber: true })} /></Field>
        <Field label="Target date"><Input type="date" {...form.register("targetDate", { setValueAs: (v: string) => v || null })} /></Field>
        <Field label="Already saved for this" hint="Existing savings, not new money."><Input type="number" inputMode="numeric" {...form.register("startingAmount", { valueAsNumber: true })} /></Field>
        <Field label="Priority"><Select {...form.register("priority")}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></Select></Field>
      </div>
      <div className="flex justify-end"><Button type="submit" loading={pending}>Create goal</Button></div>
    </form>
  );
}

function MoveForm({ fmt, available, withdraw, onSubmit, pending }: { fmt: (n: number) => string; available: number; withdraw: boolean; onSubmit: (amount: number) => Promise<void>; pending: boolean }) {
  const [amount, setAmount] = useState("");
  const [confirm, setConfirm] = useState(false);
  const n = Math.round(Number(amount));
  const tooMuch = !withdraw && n > available;
  return (
    <div className="space-y-4">
      <Field label="Amount" hint={withdraw ? undefined : `Available to move: ${fmt(available)}`} error={tooMuch ? "That's more than your recorded available money." : undefined}>
        <Input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-1" />
        <span>I understand this is a <strong>simulated</strong> transfer recorded in Trust Manager. No MoMo or bank money moves.</span>
      </label>
      <div className="flex justify-end"><Button disabled={!n || n <= 0 || tooMuch || !confirm} loading={pending} onClick={() => void onSubmit(n)}>{withdraw ? "Record withdrawal" : "Record transfer"}</Button></div>
    </div>
  );
}
