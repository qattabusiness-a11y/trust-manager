"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bot, FileText, Save, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ErrorState, LoadingState, NoAccess, PageHeader, SEVERITY_STYLES } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge, Tabs } from "@/components/ui/misc";
import { useAction, useList } from "@/hooks/use-data";
import { useFinance } from "@/hooks/use-finance";
import { fmtDate, fmtLocalDate, monthKey } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { financialAdvisor, personaProfile } from "@/services/advisor.service";
import type { AdvisorResponse } from "@/types";

type Mode = "recommendations" | "spending" | "weekly" | "monthly";

export default function AdvisorPage() {
  const f = useFinance();
  const reports = useList("advisoryReports");
  const { run, pending } = useAction();
  const [mode, setMode] = useState<Mode>("recommendations");
  const [openReport, setOpenReport] = useState<AdvisorResponse | null>(null);

  const ready = !f.loading && !!f.household;
  const result = useQuery({
    queryKey: ["advisor", mode, f.persona?.id, f.snapshot.balance, f.snapshot.savings, f.snapshot.budget?.month.spent, f.data.transactions.length, f.data.shoppingItems.length, f.data.recurring.length, f.data.contributions.length, f.data.savingsGoals.length],
    enabled: ready && f.can("view_advisor"),
    queryFn: () => {
      const ctx = { persona: f.persona, data: f.data, snapshot: f.snapshot };
      if (mode === "spending") return financialAdvisor.analyzeSpending(ctx);
      if (mode === "weekly") return financialAdvisor.generateWeeklyReport(ctx);
      if (mode === "monthly") return financialAdvisor.generateMonthlyReport(ctx);
      return financialAdvisor.generateRecommendations(ctx);
    },
  });

  if (f.loading) return <LoadingState rows={4} />;
  if (f.error) return <ErrorState error={f.error} />;
  if (!f.can("view_advisor")) return <NoAccess what="the financial advisor" />;
  const p = f.persona;
  const profiles = personaProfile(p, f.snapshot.income.totalMonthly - (f.budget?.monthlyBudget ?? 0));
  const r = result.data;
  const past = [...(reports.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-6">
      <PageHeader title="AI Financial Advisor" description="Personal guidance generated from your own records and household profile — clearly separating facts from estimates." />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <Tabs value={mode} onChange={setMode} items={[{ value: "recommendations", label: "Recommendations" }, { value: "spending", label: "Spending analysis" }, { value: "weekly", label: "Weekly report" }, { value: "monthly", label: "Monthly report" }]} />
          {result.isLoading || !r ? (
            <LoadingState rows={3} />
          ) : (
            <>
              <Card className="overflow-hidden">
                <div className="flex items-start gap-3 bg-navy p-5 text-white">
                  <Bot className="mt-0.5 size-6 shrink-0 text-green-400" />
                  <div className="flex-1">
                    <p className="font-medium">{r.summary}</p>
                    <p className="mt-1 text-xs text-white/60">Generated {fmtDate(r.generatedAt, f.snapshot.tz, "d MMM, HH:mm")} · {r.provider}</p>
                  </div>
                  {(mode === "weekly" || mode === "monthly") && (
                    <Button size="sm" variant="soft" loading={pending} onClick={() => void run((api) => api.create("advisoryReports", { householdId: api.actor.householdId!, kind: mode, periodLabel: mode === "monthly" ? fmtLocalDate(`${monthKey(f.snapshot.tz)}-01`, "MMMM yyyy") : `Week of ${fmtDate(new Date().toISOString(), f.snapshot.tz, "d MMM yyyy")}`, generatedBy: r.provider, content: r }), "Report saved.")}>
                      <Save /> Save report
                    </Button>
                  )}
                </div>
              </Card>
              <InsightList r={r} />
              <p className="text-xs text-muted">{r.disclaimer}</p>
            </>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-brand" /> Tailored to you</CardTitle><CardDescription>From your onboarding profile. Update it in Settings.</CardDescription></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {p ? (
                <>
                  <p>{p.occupation} · {p.employmentStatus.replace("-", " ")} · age {p.age}</p>
                  <p>Household of {p.householdSize}, {p.dependents} dependent{p.dependents === 1 ? "" : "s"}</p>
                  <p>{p.city}, {p.country} · {p.currency}</p>
                  <p>Income {p.incomeFrequency} · risk tolerance {p.riskTolerance}</p>
                  <div className="flex flex-wrap gap-1 pt-1">{profiles.map((x) => <Badge key={x} tone="blue">{x.replace("_", " ")}</Badge>)}</div>
                  <div className="flex flex-wrap gap-1">{p.financialGoals.map((g) => <Badge key={g} tone="green">{g}</Badge>)}</div>
                </>
              ) : <p className="text-muted">No profile found.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="size-4" /> Saved reports</CardTitle></CardHeader>
            <CardContent>
              {past.length === 0 ? <p className="text-sm text-muted">Save a weekly or monthly report to keep it here.</p> : (
                <ul className="space-y-1">
                  {past.map((rep) => (
                    <li key={rep.id}><button className="w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50" onClick={() => setOpenReport(rep.content)}><span className="font-medium capitalize">{rep.kind}</span> · {rep.periodLabel}</button></li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!openReport} onOpenChange={(o) => !o && setOpenReport(null)}>
        <DialogContent title="Saved report" wide>{openReport && <><p className="mb-4 text-sm">{openReport.summary}</p><InsightList r={openReport} /></>}</DialogContent>
      </Dialog>
    </div>
  );
}

function InsightList({ r }: { r: AdvisorResponse }) {
  return (
    <div className="space-y-3">
      {r.insights.map((i) => {
        const st = SEVERITY_STYLES[i.severity];
        return (
          <Card key={i.id} className="relative overflow-hidden p-5 pl-6">
            <span className={cn("absolute inset-y-0 left-0 w-1.5", st.bar)} />
            <div className="flex flex-wrap items-center gap-2"><Badge tone={st.tone} className="capitalize">{i.kind}</Badge><Badge tone="gray" className="capitalize">{i.severity}</Badge></div>
            <h3 className="mt-2 font-semibold">{i.title}</h3>
            <p className="mt-1 text-sm text-navy/80">{i.message}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {i.facts.length > 0 && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Facts from your records</p>
                  <ul className="space-y-0.5 text-xs">{i.facts.map((x) => <li key={x}>• {x}</li>)}</ul>
                </div>
              )}
              {i.estimates.length > 0 && (
                <div className="rounded-lg border border-dashed border-warn/50 bg-warn-light/30 p-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-warn-dark">Estimates</p>
                  <ul className="space-y-0.5 text-xs">{i.estimates.map((x) => <li key={x}>• {x}</li>)}</ul>
                </div>
              )}
            </div>
            {i.action && <Link href={i.action.href} className={cn("mt-3 inline-flex items-center gap-1 text-xs font-semibold hover:underline", st.text)}>{i.action.label} <ArrowRight className="size-3" /></Link>}
          </Card>
        );
      })}
    </div>
  );
}
