"use client";

import { CalendarClock, TrendingDown } from "lucide-react";
import { CategoryDonut, DailyTrendChart, ForecastChart, IncomeExpenseChart, SavingsGrowthChart, WeeklyUtilizationChart } from "@/components/analytics/lazy";
import { EmptyState, ErrorState, LoadingState, NoAccess, PageHeader, Stat } from "@/components/shared";
import { TopPayees } from "@/components/transactions/TopPayees";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { useFinance } from "@/hooks/use-finance";
import { fmtLocalDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export default function AnalyticsPage() {
  const f = useFinance();
  if (f.loading) return <LoadingState rows={6} />;
  if (f.error) return <ErrorState error={f.error} />;
  if (!f.can("view_transactions")) return <NoAccess what="household analytics" />;
  const s = f.snapshot;
  const p = s.prediction;
  const canBalances = f.can("view_balances");
  const totalBehaviors = s.behaviorCounts.green + s.behaviorCounts.yellow + s.behaviorCounts.red;

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description="Every chart is drawn from your recorded transactions, budgets and savings." />

      <section id="forecast" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingDown className="size-4" /> When could your money run out?</CardTitle>
            <CardDescription>An estimate, not a guarantee. It assumes your recent spending pattern continues, and includes scheduled bills, planned shopping and regular income. Irregular income is left out.</CardDescription>
          </CardHeader>
          <CardContent>
            {!canBalances ? (
              <p className="text-sm text-muted">The forecast uses household balances, which your role can&apos;t see.</p>
            ) : p.status === "insufficient_data" ? (
              <EmptyState icon={CalendarClock} title="Not enough data to calculate." description={`${p.reason} So far: ${p.observedDays} day(s), ${p.observedTransactions} transaction(s).`} />
            ) : (
              <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
                <div className="space-y-4">
                  <div className={cn("rounded-2xl p-4", p.projectedZeroDate ? ((p.projectedDaysRemaining ?? 99) <= 14 ? "bg-danger-light" : "bg-warn-light") : "bg-brand-light")}>
                    {p.projectedZeroDate ? (
                      <p className="text-sm text-navy">You may run out of available funds around <strong>{fmtLocalDate(p.projectedZeroDate, "MMMM d")}</strong> ({p.projectedDaysRemaining} days) if your current spending pattern continues.</p>
                    ) : (
                      <p className="text-sm text-navy">At your current pattern, your available funds are <strong>not projected to run out</strong> in the next 120 days.</p>
                    )}
                    <Badge tone="gray" className="mt-2">Estimate</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Stat label="Available now" value={s.fmt(s.balance)} />
                    <Stat label="Daily burn rate" value={s.fmt(p.dailyBurnRate)} sub={`over ${p.observedDays} days`} />
                    <Stat label="Simple estimate" value={Number.isFinite(p.basicDaysRemaining) ? `${p.basicDaysRemaining} days` : "—"} sub="balance ÷ burn rate, no bills or income" />
                    <Stat label="Lowest point (60 days)" value={s.fmt(p.lowestProjectedBalance)} tone={p.lowestProjectedBalance < 0 ? "red" : undefined} sub={fmtLocalDate(p.lowestOn, "d MMM")} />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Scheduled in the forecast</p>
                    <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                      {p.flowsConsidered.slice(0, 12).map((fl, i) => (
                        <li key={i} className="flex justify-between gap-2"><span>{fmtLocalDate(fl.date, "d MMM")} · {fl.label}</span><span className={cn("money", fl.amount > 0 ? "text-brand-dark" : "text-navy")}>{s.fmt(fl.amount, { sign: true })}</span></li>
                      ))}
                    </ul>
                    {p.excludedIrregularIncome && <p className="mt-2 text-[11px] text-muted">Irregular income was excluded to keep the estimate conservative.</p>}
                  </div>
                </div>
                <ForecastChart data={p.series.map((x) => ({ label: fmtLocalDate(x.date, "d MMM"), balance: x.balance }))} currency={s.currency} height={320} />
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Income vs expenses</CardTitle></CardHeader><CardContent><IncomeExpenseChart data={s.incomeVsExpenses} currency={s.currency} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Weekly budget use</CardTitle></CardHeader><CardContent><WeeklyUtilizationChart data={s.weeklyUtilization} currency={s.currency} /></CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Daily spending — last 30 days</CardTitle></CardHeader><CardContent><DailyTrendChart data={s.dailyTrend} currency={s.currency} height={260} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Expense categories this month</CardTitle></CardHeader><CardContent>{s.categoryBreakdown.length ? <CategoryDonut data={s.categoryBreakdown} currency={s.currency} height={200} /> : <p className="text-sm text-muted">No spending this month.</p>}</CardContent></Card>
        <Card>
          <CardHeader><CardTitle>Spending behavior this month</CardTitle><CardDescription>From the color-coding engine (including your corrections).</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {(["green", "yellow", "red"] as const).map((b) => (
              <div key={b}>
                <div className="mb-1 flex justify-between text-xs"><span>{b === "green" ? "Healthy" : b === "yellow" ? "Caution" : "Critical"}</span><span className="font-medium">{s.behaviorCounts[b]} transactions</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full rounded-full", b === "green" ? "bg-brand" : b === "yellow" ? "bg-warn" : "bg-danger")} style={{ width: `${totalBehaviors ? (s.behaviorCounts[b] / totalBehaviors) * 100 : 0}%` }} /></div>
              </div>
            ))}
            {s.budget && <p className="pt-2 text-xs text-muted">Essentials {s.fmt(s.budget.essentialSpent)} · flexible {s.fmt(s.budget.flexibleSpent)} this month.</p>}
          </CardContent>
        </Card>
        {canBalances && <Card className="lg:col-span-2"><CardHeader><CardTitle>Savings growth</CardTitle></CardHeader><CardContent><SavingsGrowthChart data={s.savingsGrowth} currency={s.currency} /></CardContent></Card>}
      </div>

      <TopPayees transactions={f.data.transactions} categories={f.data.categories} tz={s.tz} currency={s.currency} />
    </div>
  );
}
