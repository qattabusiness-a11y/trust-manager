"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightLeft, Lightbulb, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ConfirmDialog, EmptyState, ErrorState, LoadingState, NoAccess, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/inputs";
import { Badge, Progress, Tabs } from "@/components/ui/misc";
import { useAction, useList } from "@/hooks/use-data";
import { useFinance } from "@/hooks/use-finance";
import { goalBalance } from "@/lib/calculations/balance";
import { fmtLocalDate } from "@/lib/dates";
import { visionSchema } from "@/lib/validations";
import { pct } from "@/lib/utils";
import type { VisionLedgerEntry } from "@/types";

type Values = z.input<typeof visionSchema>;
const CATEGORY: Record<VisionLedgerEntry["category"], string> = { dream: "Financial dream", business: "Business idea", long_term: "Long-term goal", purchase: "Purchase plan", milestone: "Personal milestone", investment_learning: "Investment learning" };
const STATUS: Record<VisionLedgerEntry["status"], string> = { idea: "Idea", planning: "Planning", in_progress: "In progress", achieved: "Achieved", archived: "Archived" };

export default function VisionPage() {
  const f = useFinance();
  const vision = useList("visionEntries");
  const { run, pending } = useAction();
  const [editing, setEditing] = useState<VisionLedgerEntry | "new" | null>(null);
  const [converting, setConverting] = useState<VisionLedgerEntry | null>(null);
  const [removing, setRemoving] = useState<VisionLedgerEntry | null>(null);
  const [filter, setFilter] = useState<"active" | "all">("active");
  if (f.loading || vision.isLoading) return <LoadingState rows={4} />;
  if (f.error) return <ErrorState error={f.error} />;
  if (!f.can("view_budget")) return <NoAccess what="the Vision Ledger" />;
  const s = f.snapshot;
  const canManage = f.can("manage_savings");
  const opening = new Map(f.data.savingsAccounts.map((a) => [a.id, a.openingBalance]));
  const goals = new Map(f.data.savingsGoals.map((g) => [g.id, g]));
  const entries = vision.data ?? [];
  const shown = entries.filter((e) => filter === "all" || e.status !== "archived");

  return (
    <div>
      <PageHeader title="Vision Ledger" description="Dreams, business ideas and big plans — and a path from idea to a funded savings goal." actions={canManage && <Button onClick={() => setEditing("new")}><Plus /> New entry</Button>} />
      <Tabs value={filter} onChange={setFilter} className="mb-4" items={[{ value: "active", label: "Active" }, { value: "all", label: "All, including archived" }]} />
      {shown.length === 0 ? (
        <EmptyState icon={Lightbulb} title="Your Vision Ledger is empty" description="Write down a dream or business idea. When you're ready, turn it into a savings goal." action={canManage ? <Button onClick={() => setEditing("new")}><Plus /> Add your first idea</Button> : undefined} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((e) => {
            const goal = e.goalId ? goals.get(e.goalId) : null;
            const saved = goal ? goalBalance(goal.id, opening.get(goal.accountId) ?? 0, f.data.contributions) : null;
            const progress = goal && e.targetAmount ? pct(saved!, e.targetAmount) : e.progress;
            return (
              <Card key={e.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <Badge tone="blue">{CATEGORY[e.category]}</Badge>
                  <Badge tone={e.status === "achieved" ? "green" : e.priority === "high" ? "red" : "gray"}>{STATUS[e.status]} · {e.priority}</Badge>
                </div>
                <h3 className="mt-3 font-semibold">{e.title}</h3>
                <p className="mt-1 flex-1 text-sm text-muted">{e.description}</p>
                {e.targetAmount > 0 && (
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted">{goal ? `${s.fmt(saved!)} saved` : `Target ${s.fmt(e.targetAmount)}`}</span>
                      <span className="font-medium">{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} />
                    {goal && <p className="mt-1 text-xs text-muted">Target {s.fmt(e.targetAmount)} · remaining {s.fmt(Math.max(0, e.targetAmount - saved!))}</p>}
                  </div>
                )}
                {!e.targetAmount && <div className="mt-4"><Progress value={e.progress} /><p className="mt-1 text-xs text-muted">{e.progress}% progress</p></div>}
                <p className="mt-2 text-xs text-muted">{e.targetDate ? `Target date ${fmtLocalDate(e.targetDate, "MMM yyyy")}` : "No target date"}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {goal ? (
                    <Button asChild size="sm" variant="soft"><Link href="/savings">View savings goal</Link></Button>
                  ) : (
                    canManage && <Button size="sm" variant="soft" onClick={() => setConverting(e)}><ArrowRightLeft /> Make it a goal</Button>
                  )}
                  {canManage && <Button size="icon-sm" variant="ghost" onClick={() => setEditing(e)} aria-label="Edit"><Pencil /></Button>}
                  {canManage && <Button size="icon-sm" variant="ghost" onClick={() => setRemoving(e)} aria-label="Delete"><Trash2 /></Button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? "New Vision Ledger entry" : "Edit entry"}>
          {editing && <VisionForm initial={editing === "new" ? null : editing} pending={pending} onSubmit={async (raw) => {
            const v = visionSchema.parse(raw);
            await run((api) => editing === "new" ? api.create("visionEntries", { householdId: api.actor.householdId!, goalId: null, createdBy: api.actor.userId, ...v }) : api.update("visionEntries", editing.id, v), "Saved.");
            setEditing(null);
          }} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!converting} onOpenChange={(o) => !o && setConverting(null)}>
        <DialogContent title={`Turn “${converting?.title}” into a savings goal`}>
          {converting && <ConvertForm entry={converting} fmt={s.fmt} pending={pending} onSubmit={async (target, date, start) => {
            await run(async (api) => {
              const hid = api.actor.householdId!;
              const acc = await api.create("savingsAccounts", { householdId: hid, name: `${converting.title} fund`, kind: "goal", openingBalance: start });
              const goal = await api.create("savingsGoals", { householdId: hid, name: converting.title, targetAmount: target, targetDate: date, accountId: acc.id, priority: converting.priority, status: "active", visionEntryId: converting.id });
              await api.update("visionEntries", converting.id, { goalId: goal.id, targetAmount: target, targetDate: date, status: "in_progress" });
            }, "Savings goal created from your Vision Ledger.");
            setConverting(null);
          }} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title={`Delete “${removing?.title}”?`} description="Any linked savings goal is kept." confirmLabel="Delete" danger onConfirm={async () => { await run((api) => api.remove("visionEntries", removing!.id), "Entry deleted."); setRemoving(null); }} />
    </div>
  );
}

function VisionForm({ initial, onSubmit, pending }: { initial: VisionLedgerEntry | null; onSubmit: (v: Values) => Promise<void>; pending: boolean }) {
  const form = useForm<Values>({ resolver: zodResolver(visionSchema), defaultValues: initial ?? { title: "", description: "", category: "dream", targetAmount: 0, targetDate: null, priority: "medium", progress: 0, status: "idea" } });
  const e = form.formState.errors;
  const num = { valueAsNumber: true } as const;
  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <Field label="Title" error={e.title?.message}><Input {...form.register("title")} /></Field>
      <Field label="Description"><Textarea rows={3} {...form.register("description")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category"><Select {...form.register("category")}>{Object.entries(CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Status"><Select {...form.register("status")}>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Target amount (0 if none)" error={e.targetAmount?.message}><Input type="number" inputMode="numeric" {...form.register("targetAmount", num)} /></Field>
        <Field label="Target date"><Input type="date" {...form.register("targetDate", { setValueAs: (v: string) => v || null })} /></Field>
        <Field label="Priority"><Select {...form.register("priority")}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></Select></Field>
        <Field label="Progress (%)" error={e.progress?.message}><Input type="number" min={0} max={100} {...form.register("progress", num)} /></Field>
      </div>
      <div className="flex justify-end"><Button type="submit" loading={pending}>Save</Button></div>
    </form>
  );
}

function ConvertForm({ entry, fmt, onSubmit, pending }: { entry: VisionLedgerEntry; fmt: (n: number) => string; onSubmit: (target: number, date: string | null, start: number) => Promise<void>; pending: boolean }) {
  const [target, setTarget] = useState(String(entry.targetAmount || ""));
  const [date, setDate] = useState(entry.targetDate ?? "");
  const [start, setStart] = useState("0");
  const t = Math.round(Number(target));
  const st = Math.round(Number(start) || 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Target amount"><Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
        <Field label="Target date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Already saved" hint="Existing savings for this, not new money." className="sm:col-span-2"><Input type="number" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      </div>
      {t > 0 && <p className="rounded-xl bg-slate-50 p-3 text-sm">Target {fmt(t)} · already saved {fmt(st)} · remaining <strong>{fmt(Math.max(0, t - st))}</strong></p>}
      <div className="flex justify-end"><Button disabled={!t || t <= 0} loading={pending} onClick={() => void onSubmit(t, date || null, st)}>Create savings goal</Button></div>
    </div>
  );
}
