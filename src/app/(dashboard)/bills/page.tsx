"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { addDays, endOfMonth, format, getDay, parseISO, startOfMonth } from "date-fns";
import { CalendarCheck2, ChevronLeft, ChevronRight, ListChecks, Pause, Pencil, Play, Plus, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ConfirmDialog, EmptyState, ErrorState, LoadingState, NoAccess, PageHeader, Stat } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/inputs";
import { Badge, Tabs } from "@/components/ui/misc";
import { CAT } from "@/constants";
import { useAction } from "@/hooks/use-data";
import { useFinance } from "@/hooks/use-finance";
import { monthlyEquivalent } from "@/lib/calculations/budget";
import { scheduledFlows } from "@/lib/calculations/schedule";
import { advanceDate, daysUntil, fmtLocalDate, todayLocal } from "@/lib/dates";
import { recurringSchema } from "@/lib/validations";
import { cn } from "@/lib/utils";
import { saveTransaction } from "@/services/transaction.service";
import type { RecurringPayment } from "@/types";

type Values = z.input<typeof recurringSchema>;
const CATEGORY_TO_TX: Record<string, string> = { "Rent & Housing": CAT.rent, Utilities: CAT.utilities, "Airtime & Internet": CAT.communication, Education: CAT.education, Subscriptions: CAT.subscriptions, Insurance: CAT.health, Loans: CAT.other };

export default function BillsPage() {
  const f = useFinance();
  const { run, pending } = useAction();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [editing, setEditing] = useState<RecurringPayment | "new" | null>(null);
  const [paying, setPaying] = useState<RecurringPayment | null>(null);
  const [removing, setRemoving] = useState<RecurringPayment | null>(null);
  const [cancelling, setCancelling] = useState<RecurringPayment | null>(null);
  const [usageFor, setUsageFor] = useState<RecurringPayment | null>(null);
  const s = f.snapshot;

  if (f.loading) return <LoadingState rows={5} />;
  if (f.error) return <ErrorState error={f.error} />;
  if (!f.can("view_budget")) return <NoAccess what="bills and subscriptions" />;

  const canManage = f.can("manage_recurring");
  const payments = [...f.data.recurring].sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || a.nextDueDate.localeCompare(b.nextDueDate));
  const active = payments.filter((p) => p.status === "active");
  const monthlyTotal = active.reduce((sum, p) => sum + monthlyEquivalent(p), 0);
  const subsMonthly = active.filter((p) => p.kind === "subscription").reduce((sum, p) => sum + monthlyEquivalent(p), 0);

  async function markPaid(p: RecurringPayment, record: boolean) {
    await run(async (api) => {
      if (record && api.can("add_transactions")) {
        await saveTransaction(
          api,
          { type: "expense", title: p.name, amount: p.amount, date: todayLocal(s.tz), time: "12:00", categoryId: CATEGORY_TO_TX[p.category] ?? CAT.other, merchant: p.name, paymentMethod: "momo", essential: p.essential, planned: true, notes: `Due ${p.nextDueDate}`, reference: null, recordedBalance: null },
          { tz: s.tz, currency: s.currency, source: "recurring" },
        );
      }
      await api.update("recurringPayments", p.id, { nextDueDate: advanceDate(p.nextDueDate, p.frequency), renewalDate: p.renewalDate ? advanceDate(p.renewalDate, p.frequency) : null }, "Marked as paid");
    }, `${p.name} marked as paid. Next due date moved forward.`);
    setPaying(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Bills & Subscriptions" description="Never miss a due date, and find subscriptions you no longer use." actions={canManage && <Button onClick={() => setEditing("new")}><Plus /> Add bill or subscription</Button>} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5"><Stat label="Recurring per month" value={s.fmt(monthlyTotal)} sub={`${active.length} active`} /></Card>
        <Card className="p-5"><Stat label="Due in the next 30 days" value={s.fmt(s.upcomingObligations30)} /></Card>
        <Card className="p-5"><Stat label="Subscriptions" value={`${s.fmt(subsMonthly)}/mo`} sub={`${s.fmt(subsMonthly * 12)} per year`} /></Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Upcoming payments</CardTitle><CardDescription>You get a reminder in the app at each payment&apos;s chosen intervals and on the due date.</CardDescription></div>
          <Tabs value={view} onChange={setView} items={[{ value: "list", label: "List" }, { value: "calendar", label: "Calendar" }]} />
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <EmptyState icon={CalendarCheck2} title="No recurring payments yet" description="Add rent, electricity, water, internet, school fees or subscriptions." />
          ) : view === "calendar" ? (
            <BillCalendar payments={active} tz={s.tz} fmt={s.fmt} />
          ) : (
            <ul className="divide-y divide-line">
              {payments.map((p) => {
                const d = daysUntil(p.nextDueDate, s.tz);
                return (
                  <li key={p.id} className={cn("flex flex-col gap-3 py-3 sm:flex-row sm:items-center", p.status !== "active" && "opacity-60")}>
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className={cn("flex w-14 shrink-0 flex-col items-center rounded-xl py-1.5", p.status !== "active" ? "bg-slate-100" : d < 0 ? "bg-danger-light text-danger" : d <= 3 ? "bg-warn-light text-warn-dark" : "bg-slate-100")}>
                        <span className="text-[10px] uppercase">{fmtLocalDate(p.nextDueDate, "MMM")}</span>
                        <span className="text-lg font-semibold leading-none">{fmtLocalDate(p.nextDueDate, "d")}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{p.name}<Badge tone={p.kind === "subscription" ? "blue" : p.kind === "loan" ? "yellow" : "gray"}>{p.kind}</Badge>{p.status !== "active" && <Badge tone="gray">{p.status}</Badge>}</p>
                        <p className="text-xs text-muted">
                          {p.frequency} · {p.status === "active" ? (d < 0 ? `overdue by ${-d} day${d === -1 ? "" : "s"}` : d === 0 ? "due today" : `due in ${d} day${d === 1 ? "" : "s"}`) : "no reminders"} · reminders {p.reminderDays.length ? [...p.reminderDays].sort((a, b) => b - a).join(", ") + " days before" : "on due date only"}
                        </p>
                      </div>
                    </div>
                    <p className="money text-sm font-semibold sm:w-28 sm:text-right">{s.fmt(p.amount)}</p>
                    {canManage && (
                      <div className="flex flex-wrap gap-1">
                        {p.status === "active" && <Button size="sm" variant="soft" onClick={() => setPaying(p)}>Mark paid</Button>}
                        {p.status === "active" && <Button size="icon-sm" variant="ghost" onClick={() => void run((api) => api.update("recurringPayments", p.id, { status: "paused" }), `${p.name} paused.`)} aria-label="Pause"><Pause /></Button>}
                        {p.status === "paused" && <Button size="icon-sm" variant="ghost" onClick={() => void run((api) => api.update("recurringPayments", p.id, { status: "active" }), `${p.name} resumed.`)} aria-label="Resume"><Play /></Button>}
                        {p.kind === "subscription" && p.status !== "cancelled" && <Button size="icon-sm" variant="ghost" onClick={() => setCancelling(p)} aria-label="Cancel subscription"><XCircle /></Button>}
                        <Button size="icon-sm" variant="ghost" onClick={() => setEditing(p)} aria-label="Edit"><Pencil /></Button>
                        <Button size="icon-sm" variant="ghost" onClick={() => setRemoving(p)} aria-label="Delete"><Trash2 /></Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <section id="audit" className="scroll-mt-20">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ListChecks className="size-4" /> Subscription audit</CardTitle><CardDescription>Based on usage you record here. Trust Manager doesn&apos;t independently verify usage.</CardDescription></CardHeader>
          <CardContent>
            {s.subscriptions.length === 0 ? <p className="text-sm text-muted">No active subscriptions.</p> : (
              <ul className="space-y-3">
                {s.subscriptions.map((a) => (
                  <li key={a.paymentId} className={cn("rounded-xl border p-4", a.verdict === "unused" ? "border-warn/50 bg-warn-light/40" : a.verdict === "review" ? "border-line bg-slate-50" : "border-line")}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="flex items-center gap-2 text-sm font-medium">{a.name}<Badge tone={a.verdict === "keep" ? "green" : "yellow"}>{a.verdict === "keep" ? "In use" : a.verdict === "review" ? "Review" : "Unused"}</Badge></p>
                        <p className="mt-0.5 text-xs text-muted">{a.message}</p>
                        <p className="mt-1 text-xs text-muted">{s.fmt(a.monthlyCost)}/month · {s.fmt(a.annualCost)}/year · last used {a.lastUsedOn ? fmtLocalDate(a.lastUsedOn, "d MMM yyyy") : "never recorded"}</p>
                      </div>
                      {canManage && (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setUsageFor(f.data.recurring.find((r) => r.id === a.paymentId)!)}>Log usage</Button>
                          {a.verdict !== "keep" && <Button size="sm" variant="danger" onClick={() => setCancelling(f.data.recurring.find((r) => r.id === a.paymentId)!)}>Cancel subscription</Button>}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? "Add bill or subscription" : "Edit recurring payment"}>
          {editing && (
            <RecurringForm initial={editing === "new" ? null : editing} tz={s.tz} pending={pending} onSubmit={async (raw) => {
              const v = recurringSchema.parse(raw);
              await run((api) => editing === "new"
                ? api.create("recurringPayments", { householdId: api.actor.householdId!, status: "active", renewalDate: v.kind === "subscription" ? v.nextDueDate : null, ...v, endDate: v.endDate ?? null })
                : api.update("recurringPayments", editing.id, { ...v, endDate: v.endDate ?? null }), "Saved.");
              setEditing(null);
            }} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!paying} onOpenChange={(o) => !o && setPaying(null)}>
        <DialogContent title={`Mark ${paying?.name} as paid`}>
          {paying && <PayForm p={paying} fmt={s.fmt} canRecord={f.can("add_transactions")} pending={pending} onPay={(rec) => void markPaid(paying, rec)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!usageFor} onOpenChange={(o) => !o && setUsageFor(null)}>
        <DialogContent title={`Log usage — ${usageFor?.name}`} description="Record days you actually used this subscription.">
          {usageFor && <UsageForm tz={s.tz} pending={pending} onSubmit={async (date) => {
            await run((api) => api.create("subscriptionUsage", { householdId: api.actor.householdId!, recurringPaymentId: usageFor.id, usedOn: date, note: "" }), "Usage recorded.");
            setUsageFor(null);
          }} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)} title={`Cancel ${cancelling?.name}?`} description="This marks the subscription as cancelled in Trust Manager and stops reminders. Remember to also cancel it with the provider." confirmLabel="Cancel subscription" danger
        onConfirm={async () => { await run((api) => api.update("recurringPayments", cancelling!.id, { status: "cancelled" }), "Subscription marked as cancelled."); setCancelling(null); }} />
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title={`Delete ${removing?.name}?`} description="Past payments stay recorded." confirmLabel="Delete" danger
        onConfirm={async () => { await run((api) => api.remove("recurringPayments", removing!.id), "Deleted."); setRemoving(null); }} />
    </div>
  );
}

function PayForm({ p, fmt, canRecord, onPay, pending }: { p: RecurringPayment; fmt: (n: number) => string; canRecord: boolean; onPay: (record: boolean) => void; pending: boolean }) {
  const [record, setRecord] = useState(canRecord);
  return (
    <div className="space-y-4">
      <p className="text-sm">Amount: <strong className="money">{fmt(p.amount)}</strong> · due {fmtLocalDate(p.nextDueDate, "d MMM yyyy")}. The next due date becomes {fmtLocalDate(advanceDate(p.nextDueDate, p.frequency), "d MMM yyyy")}.</p>
      {canRecord && <Switch checked={record} onChange={setRecord} label="Record the payment as an expense" description="Updates your budget and balance." />}
      <div className="flex justify-end"><Button loading={pending} onClick={() => onPay(record)}>Confirm paid</Button></div>
    </div>
  );
}

function UsageForm({ tz, onSubmit, pending }: { tz: string; onSubmit: (d: string) => Promise<void>; pending: boolean }) {
  const [date, setDate] = useState(todayLocal(tz));
  return (
    <div className="space-y-4">
      <Field label="Date used"><Input type="date" value={date} max={todayLocal(tz)} onChange={(e) => setDate(e.target.value)} /></Field>
      <div className="flex justify-end"><Button loading={pending} onClick={() => void onSubmit(date)}>Save usage</Button></div>
    </div>
  );
}

const REMINDER_OPTIONS = [7, 3, 1];

function RecurringForm({ initial, tz, onSubmit, pending }: { initial: RecurringPayment | null; tz: string; onSubmit: (v: Values) => Promise<void>; pending: boolean }) {
  const form = useForm<Values>({
    resolver: zodResolver(recurringSchema),
    defaultValues: initial
      ? { name: initial.name, amount: initial.amount, category: initial.category, kind: initial.kind, frequency: initial.frequency, nextDueDate: initial.nextDueDate, endDate: initial.endDate ?? null, reminderDays: initial.reminderDays, essential: initial.essential }
      : { name: "", amount: undefined as unknown as number, category: "Utilities", kind: "bill", frequency: "monthly", nextDueDate: todayLocal(tz), endDate: null, reminderDays: [7, 3, 1], essential: true },
  });
  const e = form.formState.errors;
  const days = form.watch("reminderDays") ?? [];
  const [customDay, setCustomDay] = useState("");
  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={e.name?.message} className="sm:col-span-2"><Input {...form.register("name")} placeholder="e.g. Electricity (REG)" /></Field>
        <Field label="Amount" error={e.amount?.message}><Input type="number" inputMode="numeric" {...form.register("amount", { valueAsNumber: true })} /></Field>
        <Field label="Type"><Select {...form.register("kind")}><option value="bill">Bill</option><option value="subscription">Subscription</option><option value="loan">Loan repayment</option></Select></Field>
        <Field label="Category"><Select {...form.register("category")}>{["Rent & Housing", "Utilities", "Airtime & Internet", "Education", "Insurance", "Subscriptions", "Loans", "Other"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Frequency"><Select {...form.register("frequency")}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly / per term</option><option value="yearly">Yearly</option></Select></Field>
        <Field label="Next due date" error={e.nextDueDate?.message}><Input type="date" {...form.register("nextDueDate")} /></Field>
        <Field label="End date (optional)"><Input type="date" {...form.register("endDate", { setValueAs: (v: string) => v || null })} /></Field>
      </div>
      <Field label="Remind me (days before)" hint="You'll always get a reminder on the due date too.">
        <div className="flex flex-wrap items-center gap-2">
          {[...new Set([...REMINDER_OPTIONS, ...days])].sort((a, b) => b - a).map((d) => {
            const on = days.includes(d);
            return <button type="button" key={d} onClick={() => form.setValue("reminderDays", on ? days.filter((x) => x !== d) : [...days, d])} className={cn("rounded-full border px-3 py-1 text-xs", on ? "border-brand bg-brand-light text-brand-dark" : "border-line")}>{d} day{d === 1 ? "" : "s"}</button>;
          })}
          <Input className="h-8 w-20" type="number" placeholder="Custom" value={customDay} onChange={(ev) => setCustomDay(ev.target.value)} />
          <Button type="button" size="sm" variant="outline" onClick={() => { const n = Number(customDay); if (n > 0 && n <= 60 && !days.includes(n)) form.setValue("reminderDays", [...days, n]); setCustomDay(""); }}>Add</Button>
        </div>
      </Field>
      <Switch checked={!!form.watch("essential")} onChange={(v) => form.setValue("essential", v)} label="Essential" description="Rent, utilities, school fees — always kept aside in forecasts." />
      <div className="flex justify-end"><Button type="submit" loading={pending}>Save</Button></div>
    </form>
  );
}

function BillCalendar({ payments, tz, fmt }: { payments: RecurringPayment[]; tz: string; fmt: (n: number) => string }) {
  const [offset, setOffset] = useState(0);
  const today = todayLocal(tz);
  const base = parseISO(today);
  const month = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const flows = scheduledFlows(format(start, "yyyy-MM-dd"), format(end, "yyyy-MM-dd"), [], payments);
  const byDay = new Map<string, typeof flows>();
  for (const fl of flows) byDay.set(fl.date, [...(byDay.get(fl.date) ?? []), fl]);
  const lead = (getDay(start) + 6) % 7;
  const cells = Array.from({ length: lead + end.getDate() }, (_, i) => (i < lead ? null : format(addDays(start, i - lead), "yyyy-MM-dd")));
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Button size="icon-sm" variant="ghost" onClick={() => setOffset((o) => o - 1)} aria-label="Previous month"><ChevronLeft /></Button>
        <p className="text-sm font-semibold">{format(month, "MMMM yyyy")}</p>
        <Button size="icon-sm" variant="ghost" onClick={() => setOffset((o) => o + 1)} aria-label="Next month"><ChevronRight /></Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => (
          <div key={i} className={cn("min-h-16 rounded-lg border p-1 text-left text-[11px] sm:min-h-20", !d ? "border-transparent" : d === today ? "border-brand bg-brand-light/40" : "border-line")}>
            {d && <span className="font-medium">{Number(d.slice(8))}</span>}
            {d && byDay.get(d)?.map((fl) => (
              <p key={fl.label} className="mt-0.5 truncate rounded bg-navy px-1 text-[10px] text-white" title={`${fl.label} ${fmt(-fl.amount)}`}>{fl.label}</p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
