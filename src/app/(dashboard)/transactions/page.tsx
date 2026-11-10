"use client";

import { Plus, ScanLine, Search, SlidersHorizontal } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState, NoAccess, PageHeader, Stat } from "@/components/shared";
import { TopPayees } from "@/components/transactions/TopPayees";
import { TransactionList } from "@/components/transactions/TransactionList";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/inputs";
import { Tabs } from "@/components/ui/misc";
import { PAYMENT_METHOD_LABELS } from "@/constants";
import { useList } from "@/hooks/use-data";
import { useFinance } from "@/hooks/use-finance";
import { useNow } from "@/hooks/use-now";
import { inPeriod, monthPeriod, weekPeriod } from "@/lib/dates";
import { useUIStore } from "@/stores/preferences.store";

type Period = "all" | "week" | "month" | "30d";

function TransactionsInner() {
  const f = useFinance();
  const params = useSearchParams();
  const router = useRouter();
  const setQuick = useUIStore((s) => s.setQuickAdd);
  const setReceipt = useUIStore((s) => s.setReceiptOpen);
  const deletedQ = useList("transactions", { includeDeleted: true });
  const [q, setQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [period, setPeriod] = useState<Period>((params.get("period") as Period) ?? "all");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [behavior, setBehavior] = useState(params.get("behavior") ?? "");
  const [method, setMethod] = useState("");
  const [tab, setTab] = useState<"list" | "payees" | "deleted">("list");
  const now = useNow();

  const s = f.snapshot;
  const filtered = useMemo(() => {
    const p = period === "week" ? weekPeriod(s.tz) : period === "month" ? monthPeriod(s.tz) : period === "30d" ? { start: new Date(now - 30 * 86_400_000), end: new Date(now + 86_400_000) } : null;
    const term = q.trim().toLowerCase();
    return f.data.transactions
      .filter((t) => !p || inPeriod(t.occurredAt, p))
      .filter((t) => !type || t.type === type)
      .filter((t) => !category || t.categoryId === category)
      .filter((t) => !method || t.paymentMethod === method)
      .filter((t) => !behavior || s.classifications.get(t.id)?.behavior === behavior)
      .filter((t) => !term || `${t.title} ${t.merchant} ${t.notes ?? ""} ${t.reference ?? ""}`.toLowerCase().includes(term))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [f.data.transactions, period, type, category, method, behavior, q, s.tz, s.classifications, now]);

  if (f.loading) return <LoadingState rows={6} />;
  if (f.error) return <ErrorState error={f.error} />;
  if (!f.can("view_transactions")) return <NoAccess what="household transactions" />;

  const activeFilters = [period !== "all", type, category, behavior, method].filter(Boolean).length;
  const spent = filtered.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  const received = filtered.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const deleted = (deletedQ.data ?? []).filter((t) => t.deletedAt).sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="Every payment in and out. Colors show spending behavior — you can correct any classification."
        actions={
          f.can("add_transactions") && (
            <>
              <Button variant="outline" onClick={() => setReceipt(true)}><ScanLine /> Upload receipt</Button>
              <Button onClick={() => setQuick(true)}><Plus /> Add transaction</Button>
            </>
          )
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-4"
        items={[
          { value: "list", label: "All transactions" },
          { value: "payees", label: "Top payees" },
          { value: "deleted", label: `Recently deleted${deleted.length ? ` (${deleted.length})` : ""}` },
        ]}
      />

      {tab === "payees" && <TopPayees transactions={f.data.transactions} categories={f.data.categories} tz={s.tz} currency={s.currency} />}

      {tab === "deleted" && (
        <Card><CardContent className="pt-5">
          {deleted.length === 0 ? <EmptyState title="Nothing deleted" description="Deleted transactions appear here so you can restore them." /> : (
            <TransactionList transactions={deleted} categories={f.data.categories} classifications={s.classifications} tz={s.tz} currency={s.currency} deleted />
          )}
        </CardContent></Card>
      )}

      {tab === "list" && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <div className="flex gap-2 lg:col-span-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, merchant, reference" className="pl-9" aria-label="Search" />
                </div>
                {/* On phones the filters fold away so the list is visible straight away. */}
                <Button type="button" variant="outline" className="sm:hidden" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} aria-controls="tx-filters">
                  <SlidersHorizontal /> Filters{activeFilters ? ` (${activeFilters})` : ""}
                </Button>
              </div>
              <div id="tx-filters" className={`${showFilters ? "grid" : "hidden"} gap-2 sm:contents`}>
              <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)} aria-label="Period">
                <option value="all">All time</option><option value="week">This week</option><option value="month">This month</option><option value="30d">Last 30 days</option>
              </Select>
              <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
                <option value="">All types</option><option value="expense">Expenses</option><option value="income">Income</option><option value="savings_transfer">Savings transfers</option>
              </Select>
              <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
                <option value="">All categories</option>
                {f.data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Select value={behavior} onChange={(e) => { setBehavior(e.target.value); if (!e.target.value) router.replace("/transactions"); }} aria-label="Behavior">
                  <option value="">All colors</option><option value="green">Healthy</option><option value="yellow">Caution</option><option value="red">Critical</option>
                </Select>
                <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method">
                  <option value="">All methods</option>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l.replace(" (MoMo)", "")}</option>)}
                </Select>
              </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-6 rounded-xl bg-slate-50 px-4 py-3">
              <Stat label="Shown" value={`${filtered.length}`} />
              <Stat label="Spent" value={s.fmt(spent)} />
              <Stat label="Received" value={s.fmt(received)} tone="green" />
            </div>
            {f.data.transactions.length === 0 ? (
              <EmptyState title="No transactions yet" description="Add your first expense or upload a receipt to start understanding your spending." action={f.can("add_transactions") ? <Button onClick={() => setQuick(true)}><Plus /> Add transaction</Button> : undefined} />
            ) : filtered.length === 0 ? (
              <EmptyState icon={Search} title="No transactions match your filters" />
            ) : (
              <TransactionList transactions={filtered} categories={f.data.categories} classifications={s.classifications} tz={s.tz} currency={s.currency} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<LoadingState rows={6} />}>
      <TransactionsInner />
    </Suspense>
  );
}
