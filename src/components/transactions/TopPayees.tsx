"use client";

import { Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/inputs";
import { Progress } from "@/components/ui/misc";
import { EmptyState } from "@/components/shared";
import { PAYMENT_METHOD_LABELS } from "@/constants";
import { topPayees } from "@/lib/calculations/insights";
import { fmtLocalDate, localDate, monthPeriod } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { PaymentMethod, Transaction, TransactionCategory } from "@/types";
import { fromZonedTime } from "date-fns-tz";

export function TopPayees({ transactions, categories, tz, currency }: { transactions: Transaction[]; categories: TransactionCategory[]; tz: string; currency: string }) {
  const months = useMemo(() => {
    const set = new Set(transactions.filter((t) => t.type === "expense" && !t.deletedAt).map((t) => localDate(t.occurredAt, tz).slice(0, 7)));
    return [...set].sort().reverse();
  }, [transactions, tz]);
  const [month, setMonth] = useState<string>("all");
  const [category, setCategory] = useState<string>("");
  const [method, setMethod] = useState<string>("");

  const period = month === "all" ? null : monthPeriod(tz, fromZonedTime(new Date(`${month}-15T12:00:00`), tz));
  const rows = topPayees(transactions, tz, { period, categoryId: category || null, paymentMethod: (method || null) as PaymentMethod | null }).slice(0, 10);
  const max = rows[0]?.total ?? 1;
  const byCount = [...rows].sort((a, b) => b.count - a.count)[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Trophy className="size-4 text-warn" /> Who receives most of your money?</CardTitle>
        <CardDescription>Ranked by total paid. Includes manual and receipt-scanned transactions.</CardDescription>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            <option value="all">All time</option>
            {months.map((m) => <option key={m} value={m}>{fmtLocalDate(`${m}-01`, "MMMM yyyy")}</option>)}
          </Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {categories.filter((c) => c.kind === "expense").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method">
            <option value="">All payment methods</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState icon={Trophy} title="No payments match these filters" />
        ) : (
          <>
            {byCount && <p className="mb-3 text-xs text-muted">Most frequently paid: <strong className="text-navy">{byCount.merchant}</strong> ({byCount.count} payments)</p>}
            <ol className="space-y-3">
              {rows.map((r, i) => (
                <li key={r.merchant} className="flex items-center gap-3">
                  <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-warn text-white" : i < 3 ? "bg-navy text-white" : "bg-slate-100 text-navy"}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium">{r.merchant}</p>
                      <p className="money text-sm font-semibold">{formatMoney(r.total, currency)}</p>
                    </div>
                    <Progress value={(r.total / max) * 100} tone={i === 0 ? "yellow" : "green"} className="mt-1 h-1.5" />
                    <p className="mt-1 text-[11px] text-muted">
                      {r.count} payment{r.count === 1 ? "" : "s"} · avg {formatMoney(r.average, currency)} · {r.share.toFixed(0)}% of spending ·{" "}
                      {Object.entries(r.monthly).sort(([a], [b]) => b.localeCompare(a)).slice(0, 2).map(([m, v]) => `${fmtLocalDate(`${m}-01`, "MMM")}: ${formatMoney(v, currency, { compact: true })}`).join(", ")}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
  );
}
