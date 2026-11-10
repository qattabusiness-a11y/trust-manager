"use client";

import { ArrowDownRight, ArrowUpRight, BadgeCheck, Boxes, PackageCheck, Plus, Store, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { PriceHistoryChart } from "@/components/analytics/lazy";
import { DemoDataBadge, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select } from "@/components/ui/inputs";
import { Badge } from "@/components/ui/misc";
import { useFinance } from "@/hooks/use-finance";
import type { BulkBuyResult } from "@/lib/calculations/bulkbuy";
import { compareProduct, latestPrices, priceSeries } from "@/lib/calculations/market";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { RecordPriceForm } from "@/components/market/RecordPriceForm";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-data";
import type { MarketComparison, MarketProduct } from "@/types";

export default function MarketPage() {
  const f = useFinance();
  const s = f.snapshot;
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [open, setOpen] = useState<MarketProduct | null>(null);
  const [recording, setRecording] = useState<{ productId?: string } | null>(null);
  const { run } = useAction();

  const current = useMemo(() => latestPrices(f.data.marketProducts, f.data.marketHistory, s.currency), [f.data.marketProducts, f.data.marketHistory, s.currency]);
  const rows = useMemo(() => {
    return f.data.marketProducts
      .map((p) => {
        const scoped = location ? current.filter((c) => c.location === location) : current;
        return { product: p, cmp: compareProduct(p, scoped, f.data.marketHistory) };
      })
      .filter((r): r is { product: MarketProduct; cmp: MarketComparison } => !!r.cmp)
      .filter((r) => !category || r.product.category === category);
  }, [f.data.marketProducts, f.data.marketHistory, current, category, location]);

  if (f.loading) return <LoadingState rows={6} />;
  if (f.error) return <ErrorState error={f.error} />;

  const locations = [...new Set(current.map((c) => c.location))];
  const categories = [...new Set(f.data.marketProducts.map((p) => p.category))];
  const cheaper = rows.filter((r) => r.cmp.changePct < -0.5).sort((a, b) => a.cmp.changePct - b.cmp.changePct);
  const pricier = rows.filter((r) => r.cmp.changePct > 0.5).sort((a, b) => b.cmp.changePct - a.cmp.changePct);
  const lastUpdated = current.map((c) => c.recordedAt).sort().at(-1);
  const hasDemo = current.some((c) => !c.verified);
  const hasReal = current.some((c) => c.verified);
  const canRecord = f.can("edit_shopping");
  const recordButton = canRecord ? <Button onClick={() => setRecording({})}><Plus /> Record a price</Button> : null;
  const recommended = s.bulkBuys.filter((b): b is Extract<BulkBuyResult, { recommended: true }> => b.recommended);
  const droppedNotRecommended = s.bulkBuys.filter((b): b is Extract<BulkBuyResult, { recommended: false }> => !b.recommended && b.dropPct >= 8);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Market Intelligence"
        description="Prices of household essentials across Rwandan markets, compared with your plans."
        actions={<>{hasDemo && <DemoDataBadge />}{recordButton}</>}
      />
      {current.length > 0 && (
        <p className="-mt-3 text-xs text-muted">
          {hasReal ? "Prices marked “Recorded” were entered by your household and are used first in every comparison. " : ""}
          {hasDemo ? "Other prices come from a simulated index for development. " : ""}
          Last recorded {lastUpdated ? fmtDate(lastUpdated, s.tz, "d MMM yyyy, HH:mm") : "—"}.
        </p>
      )}

      {current.length === 0 && (
        <EmptyState
          icon={Store}
          title="No prices recorded yet"
          description="Record what things cost at your market — when you shop or mark an item as bought. Trust Manager then compares your shopping plans with real prices, shows what is getting cheaper or more expensive, and suggests bulk buys."
          action={recordButton ?? undefined}
        />
      )}

      {current.length > 0 && (<>

      <div className="grid gap-4 md:grid-cols-2">
        <Movers title="Becoming cheaper" icon={ArrowDownRight} tone="green" rows={cheaper} fmt={s.fmt} onOpen={setOpen} />
        <Movers title="Becoming more expensive" icon={ArrowUpRight} tone="red" rows={pricier} fmt={s.fmt} onOpen={setOpen} />
      </div>

      <section id="bulk" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Boxes className="size-4 text-brand" /> Bulk-buy opportunities</CardTitle>
            <CardDescription>Only suggested when the price drop, your household&apos;s use, shelf life, storage and your upcoming bills all agree. Your emergency reserve ({s.fmt(s.reserve)}) and bills due in 30 days ({s.fmt(s.upcomingObligations30)}) are always kept aside.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!f.can("view_balances") ? (
              <p className="text-sm text-muted">Bulk-buy suggestions use household balances, which your role can&apos;t see.</p>
            ) : recommended.length === 0 ? (
              <EmptyState icon={PackageCheck} title="No bulk-buy suggested right now" description="Prices aren't low enough, or your available money is needed for bills and reserves." />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {recommended.map((b) => (
                  <div key={b.productId} className="rounded-2xl border border-brand/30 bg-brand-light/30 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{b.productName}: buy a {b.months}-month supply</p>
                        <p className="mt-0.5 text-xs text-muted">{b.productName} is currently {Math.round(b.dropPct)}% below the recorded 30-day average. Based on your household consumption, a {b.months}-month supply could reduce your expected grocery costs.</p>
                      </div>
                      <Badge tone={b.confidence === "high" ? "green" : b.confidence === "medium" ? "yellow" : "gray"}>{b.confidence} confidence</Badge>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                      <Kv k="Current price" v={`${s.fmt(b.currentPrice)}/${b.unit}`} />
                      <Kv k="30-day average" v={`${s.fmt(b.thirtyDayAverage)}/${b.unit}`} />
                      <Kv k="Suggested quantity" v={`${b.quantity} ${b.unit}`} />
                      <Kv k="Estimated total" v={s.fmt(b.totalCost)} />
                      <Kv k="Estimated savings" v={s.fmt(b.estimatedSavings)} green />
                      <Kv k="Left after purchase" v={s.fmt(b.remainingAfterPurchase)} />
                      <Kv k="Bills due (30 days)" v={s.fmt(b.upcomingObligations)} />
                      <Kv k="Emergency reserve kept" v={s.fmt(b.reserve)} />
                    </dl>
                    <ul className="mt-3 list-disc space-y-0.5 pl-4 text-[11px] text-muted">{b.rationale.map((r) => <li key={r}>{r}</li>)}</ul>
                  </div>
                ))}
              </div>
            )}
            {f.can("view_balances") && droppedNotRecommended.length > 0 && (
              <div className="rounded-xl bg-slate-50 p-3 text-xs">
                <p className="mb-1 font-medium text-navy">Cheaper, but not suggested for bulk buying:</p>
                <ul className="space-y-0.5 text-muted">
                  {droppedNotRecommended.map((b) => <li key={b.productId}>{f.data.marketProducts.find((p) => p.id === b.productId)?.name} ({Math.round(b.dropPct)}% below average) — {b.reason}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle>Current prices</CardTitle><CardDescription>Average across markets, with lowest and highest. Tap a product for its history.</CardDescription></div>
          <div className="grid grid-cols-2 gap-2 sm:w-96">
            <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category"><option value="">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}</Select>
            <Select value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location"><option value="">All locations</option>{locations.map((l) => <option key={l}>{l}</option>)}</Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 font-medium">Product</th><th className="py-2 text-right font-medium">Average</th><th className="py-2 text-right font-medium">Lowest</th><th className="py-2 text-right font-medium">Highest</th><th className="py-2 text-right font-medium">30-day avg</th><th className="py-2 text-right font-medium">Change</th><th className="py-2 text-right font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ product: p, cmp: c }) => (
                  <tr key={p.id} className="cursor-pointer border-b border-line/60 hover:bg-slate-50" onClick={() => setOpen(p)}>
                    <td className="py-2.5"><p className="flex items-center gap-1.5 font-medium">{p.name}{c.verified && <Badge tone="green"><BadgeCheck className="size-3" /> Recorded</Badge>}</p><p className="text-xs text-muted">{p.category} · per {p.unit}</p></td>
                    <td className="money py-2.5 text-right font-semibold">{s.fmt(c.average)}</td>
                    <td className="py-2.5 text-right"><p className="money">{s.fmt(c.lowest.price)}</p><p className="text-[11px] text-muted">{c.lowest.marketName}</p></td>
                    <td className="py-2.5 text-right"><p className="money">{s.fmt(c.highest.price)}</p><p className="text-[11px] text-muted">{c.highest.marketName}</p></td>
                    <td className="money py-2.5 text-right text-muted">{s.fmt(c.thirtyDayAverage)}</td>
                    <td className="py-2.5 text-right"><Change pct={c.changePct} /></td>
                    <td className="py-2.5 text-right text-xs text-muted">{fmtDate(c.recordedAt, s.tz, "d MMM")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {rows.map(({ product: p, cmp: c }) => (
              <li key={p.id}>
                <button className="flex w-full items-center justify-between rounded-xl border border-line p-3 text-left" onClick={() => setOpen(p)}>
                  <span><span className="block text-sm font-medium">{p.name}</span><span className="block text-xs text-muted">Low {s.fmt(c.lowest.price)} · High {s.fmt(c.highest.price)}</span></span>
                  <span className="text-right"><span className="money block text-sm font-semibold">{s.fmt(c.average)}/{p.unit}</span><Change pct={c.changePct} /></span>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      </>)}

      <Dialog open={!!recording} onOpenChange={(o) => !o && setRecording(null)}>
        <DialogContent title="Record a price" description="A real price you saw or paid. It is saved with the date, the place and your name.">
          {recording && <RecordPriceForm products={f.data.marketProducts} history={f.data.marketHistory} tz={s.tz} currency={s.currency} recorderName={f.profile?.fullName ?? "household member"} defaultProductId={recording.productId} onDone={() => setRecording(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent title={open?.name ?? ""} description="Average price over time." wide>
          {open && (
            <div className="space-y-4">
              <PriceHistoryChart data={priceSeries(open.id, f.data.marketHistory)} currency={s.currency} />
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">By market</p>
                <ul className="divide-y divide-line text-sm">
                  {current.filter((c) => c.productId === open.id).sort((a, b) => a.currentPrice - b.currentPrice).map((c) => (
                    <li key={c.marketName} className="flex items-center justify-between py-2">
                      <span><span className="flex items-center gap-1.5 font-medium">{c.marketName}{c.verified && <Badge tone="green"><BadgeCheck className="size-3" /> Recorded</Badge>}</span><span className="text-xs text-muted">{c.location ? `${c.location} · ` : ""}{fmtDate(c.recordedAt, s.tz, "d MMM yyyy")} · {c.source}</span></span>
                      <span className="text-right"><span className="money block font-semibold">{s.fmt(c.currentPrice)}</span><Change pct={((c.currentPrice - c.previousPrice) / c.previousPrice) * 100} /></span>
                    </li>
                  ))}
                </ul>
              </div>
              {(() => {
                const mine = f.data.marketHistory.filter((h) => h.productId === open.id && h.householdId).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
                return mine.length ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Your recorded prices</p>
                    <ul className="max-h-48 divide-y divide-line overflow-y-auto text-sm">
                      {mine.map((h) => (
                        <li key={h.id} className="flex items-center justify-between gap-2 py-1.5">
                          <span className="text-xs text-muted">{fmtDate(h.recordedAt, s.tz, "d MMM yyyy")} · {h.marketName}{h.note ? ` · ${h.note}` : ""}</span>
                          <span className="flex items-center gap-1"><span className="money font-medium">{s.fmt(h.price)}</span>
                            {canRecord && <Button size="icon-sm" variant="ghost" aria-label="Delete this price" onClick={() => void run((api) => api.remove("marketPriceHistory", h.id), "Price removed.")}><Trash2 /></Button>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null;
              })()}
              <div className="flex flex-wrap items-center justify-between gap-2">
                {current.some((c) => c.productId === open.id && !c.verified) ? <DemoDataBadge /> : <span />}
                {canRecord && <Button size="sm" variant="soft" onClick={() => { setRecording({ productId: open.id }); setOpen(null); }}><Plus /> Record a price for this</Button>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Change({ pct }: { pct: number }) {
  if (Math.abs(pct) < 0.5) return <span className="text-xs text-muted">No change</span>;
  const up = pct > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-danger" : "text-brand-dark")}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function Kv({ k, v, green }: { k: string; v: string; green?: boolean }) {
  return (
    <div>
      <dt className="text-muted">{k}</dt>
      <dd className={cn("money font-semibold", green && "text-brand-dark")}>{v}</dd>
    </div>
  );
}

function Movers({ title, icon: Icon, tone, rows, fmt, onOpen }: { title: string; icon: React.ElementType; tone: "green" | "red"; rows: { product: MarketProduct; cmp: MarketComparison }[]; fmt: (n: number) => string; onOpen: (p: MarketProduct) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Icon className={cn("size-4", tone === "green" ? "text-brand" : "text-danger")} /> {title}</CardTitle><CardDescription>Compared with the previous recorded price.</CardDescription></CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-muted">None this week.</p> : (
          <ul className="space-y-2">
            {rows.slice(0, 5).map(({ product, cmp }) => (
              <li key={product.id}>
                <button onClick={() => onOpen(product)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
                  <span className="text-sm">{product.name}</span>
                  <span className="flex items-center gap-3"><span className="money text-sm text-muted">{fmt(cmp.average)}/{product.unit}</span><Change pct={cmp.changePct} /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
