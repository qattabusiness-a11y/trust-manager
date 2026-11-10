"use client";

import { formatDistanceToNow } from "date-fns";
import { ArrowDownRight, ArrowUpRight, CalendarDays, HeartPulse, PiggyBank, Wallet, WalletCards } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { Hidden, StatusBadge, statusBar } from "@/components/shared";
import type { FinanceSnapshot } from "@/lib/calculations/snapshot";
import type { Budget } from "@/types";
import { useT } from "@/i18n";
import { cn, pct } from "@/lib/utils";

function Tile({ icon: Icon, label, href, children, className }: { icon: React.ElementType; label: string; href?: string; children: React.ReactNode; className?: string }) {
  const body = (
    <Card className={cn("flex h-full flex-col gap-3 p-5 transition-shadow", href && "hover:shadow-md", className)}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        <span className="rounded-lg bg-slate-100 p-1.5 text-navy"><Icon className="size-4" /></span>
        {label}
      </div>
      {children}
    </Card>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

export function OverviewCards({ s, budget, canBalances, canBudget }: { s: FinanceSnapshot; budget: Budget | null; canBalances: boolean; canBudget: boolean }) {
  const diff = s.balance - s.previousBalance;
  const b = s.budget;
  const target = budget?.savingsTarget ?? 0;
  const t = useT();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Tile icon={Wallet} label={t("card.available")} href={canBalances ? "/transactions" : undefined} className="xl:col-span-1">
        <Hidden visible={canBalances}>
          <p className={cn("money text-xl font-semibold 2xl:text-2xl", s.balance < 0 ? "text-danger" : "text-navy")}>{s.fmt(s.balance)}</p>
          <p className={cn("flex items-center gap-1 text-xs", diff >= 0 ? "text-brand-dark" : "text-danger")}>
            {diff >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {t("card.vs7days", { amount: s.fmt(Math.abs(diff)), prev: s.fmt(s.previousBalance) })}
          </p>
          <p className="text-[11px] text-muted">{t("card.updated", { when: s.lastUpdated ? formatDistanceToNow(new Date(s.lastUpdated), { addSuffix: true }) : "—" })}</p>
        </Hidden>
      </Tile>

      <Tile icon={WalletCards} label={t("card.monthlyBudget")} href={canBudget ? "/budget" : undefined}>
        {b && canBudget ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <p className="money text-xl font-semibold 2xl:text-2xl">{s.fmt(b.month.remaining)}</p>
              <StatusBadge status={b.month.status} />
            </div>
            <Progress value={b.month.usedPct} tone={statusBar(b.month.status)} label="Monthly budget used" />
            <p className="text-xs text-muted">
              {t("card.spentOf", { spent: s.fmt(b.month.spent), limit: s.fmt(b.month.limit), pct: Math.round(b.month.usedPct) })}
            </p>
          </>
        ) : (
          <Hidden visible={false}>{null}</Hidden>
        )}
      </Tile>

      <Tile icon={CalendarDays} label={t("card.safeToday")} href={canBudget ? "/budget" : undefined}>
        {b && canBudget ? (
          <>
            <p className={cn("money text-xl font-semibold 2xl:text-2xl", b.day.over ? "text-danger" : "text-navy")}>{s.fmt(Math.max(0, Math.min(b.recommendedDaily, b.limits.daily) - b.day.spent))}</p>
            <Progress value={b.day.usedPct} tone={statusBar(b.day.status)} label="Today's limit used" />
            <p className="text-xs text-muted">
              {t("card.spentToday", { spent: s.fmt(b.day.spent), limit: s.fmt(b.limits.daily) })}
              {b.recommendedDaily < b.limits.daily && t("card.adjusted", { amount: s.fmt(b.recommendedDaily) })}
            </p>
          </>
        ) : (
          <Hidden visible={false}>{null}</Hidden>
        )}
      </Tile>

      <Tile icon={PiggyBank} label={t("card.savings")} href={canBalances ? "/savings" : undefined}>
        <Hidden visible={canBalances}>
          <p className="money text-xl font-semibold 2xl:text-2xl text-brand-dark">{s.fmt(s.savings)}</p>
          {target > 0 && <Progress value={pct(s.savingsThisMonth, target)} label="Monthly savings target" />}
          <p className="text-xs text-muted">
            {t("card.savedThisMonth", { amount: s.fmt(s.savingsThisMonth) })}{target > 0 && t("card.ofTarget", { target: s.fmt(target) })}
          </p>
        </Hidden>
      </Tile>

      <Tile icon={HeartPulse} label={t("card.health")} href={canBudget ? "/advisor" : undefined}>
        <Hidden visible={canBudget}>
        <div className="flex items-center gap-3">
          <HealthRing score={s.health.score} status={s.health.status} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{s.health.label}</p>
            <p className="text-xs text-muted">{s.health.spendingBehavior}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {b && <span>{t("card.budgetStatus")} <strong className="text-navy capitalize">{b.month.status}</strong></span>}
          <span>{t("card.warnings")} <strong className={s.health.warnings ? "text-danger" : "text-navy"}>{s.health.warnings}</strong></span>
        </div>
        </Hidden>
      </Tile>
    </div>
  );
}

export function HealthRing({ score, status, size = 56 }: { score: number; status: "healthy" | "caution" | "warning" | "critical"; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const color = status === "healthy" ? "#16A34A" : status === "critical" ? "#DC2626" : "#EAB308";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={`Health score ${score} of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-navy text-sm font-semibold">{score}</text>
    </svg>
  );
}
