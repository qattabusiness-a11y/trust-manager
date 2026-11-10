"use client";

import { useEffect, useRef } from "react";
import { useFinance } from "@/hooks/use-finance";
import { useList } from "@/hooks/use-data";
import { useQueryClient } from "@tanstack/react-query";
import { notificationService, type Channel } from "@/services/notification.service";
import { todayLocal } from "@/lib/dates";
import { sweepSuggestions } from "@/lib/calculations/insights";
import { savingsTransferService } from "@/services/savings.service";

/**
 * Turns engine findings (bill reminders, hard stops, zero-balance risk) into
 * stored notifications once per day, deduplicated. Email/push are mock
 * deliveries recorded as "simulated".
 */
export function NotificationSync() {
  const f = useFinance();
  const prefs = useList("preferences");
  const qc = useQueryClient();
  const ran = useRef<string | null>(null);

  useEffect(() => {
    if (f.loading || !f.api || !f.household || prefs.isLoading) return;
    const day = todayLocal(f.snapshot.tz);
    const key = `${f.householdId}:${f.userId}:${day}:${f.data.transactions.length}`;
    if (ran.current === key) return;
    ran.current = key;
    const p = prefs.data?.[0];
    const channels: Channel[] = ["in_app", ...(p?.emailNotifications ? (["email"] as Channel[]) : []), ...(p?.pushNotifications ? (["push"] as Channel[]) : [])];
    const s = f.snapshot;
    const api = f.api;

    void (async () => {
      let created = 0;
      const send = async (n: Parameters<typeof notificationService.send>[1]) => {
        const r = await notificationService.send(api, n, channels);
        created += r.filter((x) => x.status !== "skipped_duplicate").length;
      };
      if (f.can("view_budget")) {
        for (const r of s.reminders) {
          await send({ userId: null, title: r.daysUntil < 0 ? "Bill overdue" : "Upcoming payment", body: r.message, severity: r.severity, actionHref: "/bills", dedupeKey: r.dedupeKey });
        }
      }
      if (s.hardStop && f.can("view_budget")) {
        await send({ userId: f.userId, title: "STOP SPENDING", body: `You have exceeded your ${s.hardStop.period} spending limit by ${s.fmt(s.hardStop.over)}.`, severity: "critical", actionHref: "/budget", dedupeKey: `hardstop:${s.hardStop.period}:${day}` });
      }
      if (s.prediction.status === "ok" && s.prediction.projectedZeroDate && (s.prediction.projectedDaysRemaining ?? 99) <= 21 && f.can("view_balances")) {
        await send({ userId: f.userId, title: "Funds may run low", body: `If spending continues at this pace, available funds may reach zero around ${s.prediction.projectedZeroDate} (estimate).`, severity: "warning", actionHref: "/analytics#forecast", dedupeKey: `zero:${s.prediction.projectedZeroDate}` });
      }
      // Automatic round-up rule (opt-in, simulated): only expenses recorded after it was enabled.
      if (p?.autoSweep && p.autoSweepSince && f.can("manage_savings")) {
        const jar = f.data.savingsAccounts.find((a) => a.kind === "micro");
        const pending = jar ? sweepSuggestions(f.data.transactions, f.data.contributions, p.roundingIncrement, new Date(p.autoSweepSince)) : [];
        for (const x of pending) {
          await savingsTransferService.transfer(api, { amount: x.spare, accountId: jar!.id, goalId: null, source: "micro_sweep", note: `Auto round-up of ${x.title}`, relatedTransactionId: x.transactionId });
        }
        if (pending.length) {
          created++;
          void qc.invalidateQueries({ queryKey: ["data"] });
        }
      }
      if (created) void qc.invalidateQueries({ queryKey: ["data", "notifications"] });
    })().catch(() => {
      /* Notification sync is best-effort; never block the UI. */
    });
  }, [f, prefs.data, prefs.isLoading, qc]);

  return null;
}
