"use client";

import { Plus, ScanLine } from "lucide-react";
import Link from "next/link";
import { CategoryDonut, DailyTrendChart, IncomeExpenseChart, SavingsGrowthChart, WeeklyUtilizationChart } from "@/components/analytics/charts";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { HardStopBanner } from "@/components/dashboard/HardStopBanner";
import { OverviewCards } from "@/components/dashboard/OverviewCards";
import { EmptyState, ErrorState, LoadingState, NoAccess } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFinance } from "@/hooks/use-finance";
import { fmtDate, greeting } from "@/lib/dates";
import { useUIStore } from "@/stores/preferences.store";

export default function OverviewPage() {
  const f = useFinance();
  const setQuick = useUIStore((s) => s.setQuickAdd);
  const setReceipt = useUIStore((s) => s.setReceiptOpen);
  if (f.loading) return <LoadingState rows={4} />;
  if (f.error) return <ErrorState error={f.error} />;
  const s = f.snapshot;
  const firstName = f.profile?.fullName.split(" ")[0] ?? "";
  const canTx = f.can("view_transactions");
  const canBudget = f.can("view_budget");
  const canBalances = f.can("view_balances");
  const noTransactions = canTx && f.data.transactions.length === 0;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-brand-dark">{fmtDate(new Date().toISOString(), s.tz, "EEEE, d MMMM yyyy")} · {f.household?.name}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{greeting(s.tz)}, {firstName}</h1>
          <p className="mt-1 text-sm text-muted">Here&apos;s where your household money stands right now.</p>
        </div>
        {f.can("add_transactions") && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setReceipt(true)}><ScanLine /> Upload receipt</Button>
            <Button onClick={() => setQuick(true)}><Plus /> Quick add</Button>
          </div>
        )}
      </div>

      {canBudget && <HardStopBanner s={s} />}

      <OverviewCards s={s} budget={f.budget} canBalances={canBalances} canBudget={canBudget} />

      {noTransactions && (
        <div className="mt-6">
          <EmptyState
            title="No transactions yet"
            description="Add your first expense or upload a receipt to start understanding your spending."
            action={<Button onClick={() => setQuick(true)}><Plus /> Add your first expense</Button>}
          />
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="grid min-w-0 gap-6 md:grid-cols-2">
          {canTx ? (
            <>
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Daily spending — last 30 days</CardTitle>
                  <CardDescription>The dashed line is your daily limit.</CardDescription>
                </CardHeader>
                <CardContent><DailyTrendChart data={s.dailyTrend} currency={s.currency} /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Income vs expenses</CardTitle><CardDescription>By month, from recorded transactions.</CardDescription></CardHeader>
                <CardContent><IncomeExpenseChart data={s.incomeVsExpenses} currency={s.currency} height={220} /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Weekly budget use</CardTitle><CardDescription>Green under 70%, yellow 70–99%, red over the limit.</CardDescription></CardHeader>
                <CardContent><WeeklyUtilizationChart data={s.weeklyUtilization} currency={s.currency} height={220} /></CardContent>
              </Card>
              <Card className="md:col-span-2">
                <CardHeader className="flex-row items-center justify-between">
                  <div><CardTitle>Where your money goes</CardTitle><CardDescription>Spending by category this month.</CardDescription></div>
                  <Link href="/analytics" className="text-xs font-medium text-brand-dark hover:underline">Full analytics</Link>
                </CardHeader>
                <CardContent>
                  {s.categoryBreakdown.length ? <CategoryDonut data={s.categoryBreakdown} currency={s.currency} height={200} /> : <p className="text-sm text-muted">No spending recorded this month yet.</p>}
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="md:col-span-2"><NoAccess what="household spending charts" /></div>
          )}
          {canBalances && (
            <Card className="md:col-span-2">
              <CardHeader><CardTitle>Savings growth</CardTitle><CardDescription>Total savings, last 8 weeks.</CardDescription></CardHeader>
              <CardContent><SavingsGrowthChart data={s.savingsGrowth} currency={s.currency} height={200} /></CardContent>
            </Card>
          )}
        </div>
        <div className="min-w-0">
          <AlertsPanel alerts={canBudget || canBalances ? s.alerts : s.alerts.filter((a) => a.id.startsWith("shopping") || a.id.startsWith("bulk"))} />
        </div>
      </div>
    </div>
  );
}
