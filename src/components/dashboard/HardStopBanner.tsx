"use client";

import { OctagonX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { FinanceSnapshot } from "@/lib/calculations/snapshot";

/** Behavioral warning only — it never blocks recording essential transactions. */
export function HardStopBanner({ s }: { s: FinanceSnapshot }) {
  const h = s.hardStop;
  if (!h) return null;
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border-2 border-danger bg-danger-light/60" role="alert" aria-live="polite">
      <div className="flex items-center gap-3 bg-danger px-5 py-3 text-white">
        <OctagonX className="size-6 shrink-0" />
        <p className="text-sm font-bold uppercase tracking-wide sm:text-base">
          Stop spending — you have exceeded your {h.period} spending limit by {s.fmt(h.over)}.
        </p>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">Amount exceeded</p>
          <p className="money text-xl font-semibold text-danger">{s.fmt(h.over)}</p>
          <p className="text-xs text-muted">Spent {s.fmt(h.spent)} of {s.fmt(h.limit)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Still available in this month&apos;s budget</p>
          <p className="money text-xl font-semibold text-navy">{s.fmt(h.remainingMonth)}</p>
          <p className="text-xs text-muted">Recorded balance: {s.fmt(s.balance)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Where it went ({h.period === "weekly" ? "this week" : "this month"})</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {h.breakdown.map((b) => (
              <li key={b.category} className="flex justify-between gap-2"><span>{b.category}</span><span className="money font-medium">{s.fmt(b.amount)}</span></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-danger/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-navy"><strong>What to do:</strong> {h.correctiveAction}</p>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline"><Link href="/transactions?period=week">Review spending</Link></Button>
          <Button asChild size="sm" variant="navy"><Link href="/budget">Adjust budget</Link></Button>
        </div>
      </div>
      <p className="px-5 pb-3 text-[11px] text-muted">This is a warning, not a block — you can still record essential expenses.</p>
    </section>
  );
}
