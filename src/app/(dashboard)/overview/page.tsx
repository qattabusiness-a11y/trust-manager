"use client";

import { Plus, ScanLine } from "lucide-react";
import Link from "next/link";
import { CategoryDonut, DailyTrendChart, IncomeExpenseChart, SavingsGrowthChart, WeeklyUtilizationChart } from "@/components/analytics/lazy";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { GettingStarted } from "@/components/dashboard/GettingStarted";
import { HardStopBanner } from "@/components/dashboard/HardStopBanner";
import { OverviewCards } from "@/components/dashboard/OverviewCards";
import { EmptyState, ErrorState, LoadingState, NoAccess } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useList } from "@/hooks/use-data";
import { useFinance } from "@/hooks/use-finance";
import { useT } from "@/i18n";
import { fmtDate, zonedNow } from "@/lib/dates";
import { useUIStore } from "@/stores/preferences.store";

export default function OverviewPage() {
  const f = useFinance();
  const setQuick = useUIStore((s) => s.setQuickAdd);
  const setReceipt = useUIStore((s) => s.setReceiptOpen);
  const members = useList("householdMembers");
  const t = useT();
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
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t(greetingKey(s.tz))}, {firstName}</h1>
          <p className="mt-1 text-sm text-muted">{t("overview.subtitle")}</p>
        </div>
        {f.can("add_transactions") && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setReceipt(true)}><ScanLine /> {t("header.uploadReceipt")}</Button>
            <Button onClick={() => setQuick(true)}><Plus /> {t("overview.quickAdd")}</Button>
          </div>
        )}
      </div>

      {f.member?.role === "owner" && f.householdId && (
        <GettingStarted
          householdId={f.householdId}
          steps={[
            { id: "tx", label: "Record your first expense", hint: "Or scan a MoMo receipt — it takes seconds.", done: f.data.transactions.some((t) => t.type === "expense"), onClick: () => setQuick(true) },
            { id: "income", label: "Add your income", hint: "So forecasts know when money arrives.", done: f.data.income.length > 0, href: "/budget" },
            { id: "bill", label: "Add a bill or subscription", hint: "Rent, electricity, school fees — get reminders.", done: f.data.recurring.length > 0, href: "/bills" },
            { id: "shop", label: "Plan your shopping", hint: "List what you need and see if it fits your budget.", done: f.data.shoppingItems.length > 0, href: "/shopping" },
            { id: "price", label: "Record a market price", hint: "Real prices make comparisons and bulk-buy tips work.", done: f.data.marketHistory.some((h) => h.householdId), href: "/market" },
            { id: "goal", label: "Create a savings goal", hint: "Emergency fund, school fees, a laptop…", done: f.data.savingsGoals.length > 0, href: "/savings" },
            { id: "invite", label: "Invite your household", hint: "Share the list without sharing your balances.", done: (members.data ?? []).filter((m) => m.status === "active").length > 1, href: "/household" },
          ]}
        />
      )}

      {canBudget && <HardStopBanner s={s} />}

      <OverviewCards s={s} budget={f.budget} canBalances={canBalances} canBudget={canBudget} />

      {noTransactions && (
        <div className="mt-6">
          <EmptyState
            title={t("overview.noTx.title")}
            description={t("overview.noTx.body")}
            action={<Button onClick={() => setQuick(true)}><Plus /> {t("overview.noTx.cta")}</Button>}
          />
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="grid min-w-0 gap-6 md:grid-cols-2">
          {canTx ? (
            <>
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>{t("overview.daily")}</CardTitle>
                  <CardDescription>{t("overview.dailyHint")}</CardDescription>
                </CardHeader>
                <CardContent><DailyTrendChart data={s.dailyTrend} currency={s.currency} /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>{t("overview.incomeVsExpenses")}</CardTitle><CardDescription>{t("overview.incomeVsExpensesHint")}</CardDescription></CardHeader>
                <CardContent><IncomeExpenseChart data={s.incomeVsExpenses} currency={s.currency} height={220} /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>{t("overview.weekly")}</CardTitle><CardDescription>{t("overview.weeklyHint")}</CardDescription></CardHeader>
                <CardContent><WeeklyUtilizationChart data={s.weeklyUtilization} currency={s.currency} height={220} /></CardContent>
              </Card>
              <Card className="md:col-span-2">
                <CardHeader className="flex-row items-center justify-between">
                  <div><CardTitle>{t("overview.whereMoneyGoes")}</CardTitle><CardDescription>{t("overview.whereMoneyGoesHint")}</CardDescription></div>
                  <Link href="/analytics" className="text-xs font-medium text-brand-dark hover:underline">{t("overview.fullAnalytics")}</Link>
                </CardHeader>
                <CardContent>
                  {s.categoryBreakdown.length ? <CategoryDonut data={s.categoryBreakdown} currency={s.currency} height={200} /> : <p className="text-sm text-muted">{t("overview.noSpendingMonth")}</p>}
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="md:col-span-2"><NoAccess what={t("overview.noAccessCharts")} /></div>
          )}
          {canBalances && (
            <Card className="md:col-span-2">
              <CardHeader><CardTitle>{t("overview.savingsGrowth")}</CardTitle><CardDescription>{t("overview.savingsGrowthHint")}</CardDescription></CardHeader>
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

function greetingKey(tz: string): "greeting.morning" | "greeting.afternoon" | "greeting.evening" {
  const h = zonedNow(tz).getHours();
  return h < 12 ? "greeting.morning" : h < 17 ? "greeting.afternoon" : "greeting.evening";
}
