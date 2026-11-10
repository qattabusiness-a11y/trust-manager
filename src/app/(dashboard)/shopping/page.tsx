"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Pencil, Plus, ShoppingBasket, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ConfirmDialog, EmptyState, ErrorState, LoadingState, NoAccess, PageHeader, Stat } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/inputs";
import { Badge, Tabs } from "@/components/ui/misc";
import { CAT, MARKET_CATEGORIES, PAYMENT_METHOD_LABELS } from "@/constants";
import { useAction, useList } from "@/hooks/use-data";
import { useFinance } from "@/hooks/use-finance";
import { compareProduct, latestPrices, planVsMarket } from "@/lib/calculations/market";
import { fmtDate, fmtLocalDate, todayLocal } from "@/lib/dates";
import { purchaseSchema, shoppingItemSchema } from "@/lib/validations";
import { cn } from "@/lib/utils";
import { saveTransaction } from "@/services/transaction.service";
import type { MarketComparison, ShoppingItem } from "@/types";

type ItemValues = z.input<typeof shoppingItemSchema>;
type PurchaseValues = z.input<typeof purchaseSchema>;

export default function ShoppingPage() {
  const f = useFinance();
  const lists = useList("shoppingLists");
  const { run, pending } = useAction();
  const [tab, setTab] = useState<"needed" | "bought">("needed");
  const [editing, setEditing] = useState<ShoppingItem | "new" | null>(null);
  const [buying, setBuying] = useState<ShoppingItem | null>(null);
  const [removing, setRemoving] = useState<ShoppingItem | null>(null);
  const s = f.snapshot;

  const comparisons = useMemo(() => {
    const current = latestPrices(f.data.marketProducts, f.data.marketHistory, s.currency);
    const map = new Map<string, MarketComparison>();
    for (const p of f.data.marketProducts) {
      const c = compareProduct(p, current, f.data.marketHistory);
      if (c) map.set(p.id, c);
    }
    return map;
  }, [f.data.marketProducts, f.data.marketHistory, s.currency]);

  if (f.loading || lists.isLoading) return <LoadingState rows={5} />;
  if (f.error) return <ErrorState error={f.error} />;
  if (!f.can("view_shopping")) return <NoAccess what="shopping lists" />;

  const items = f.data.shoppingItems;
  const needed = items.filter((i) => i.status === "needed").sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.priority] - ({ high: 0, medium: 1, low: 2 })[b.priority]);
  const bought = items.filter((i) => i.status === "bought").sort((a, b) => (b.purchasedAt ?? "").localeCompare(a.purchasedAt ?? ""));
  const plannedTotal = needed.reduce((sum, i) => sum + i.estimatedUnitPrice * i.quantity, 0);
  const boughtDiff = bought.reduce((sum, i) => sum + ((i.actualCost ?? 0) - i.estimatedUnitPrice * i.quantity), 0);
  const canEdit = f.can("edit_shopping");
  const canBuy = f.can("mark_purchased") || canEdit;
  const listId = lists.data?.[0]?.id;

  return (
    <div>
      <PageHeader
        title="Shopping Lists"
        description="Plan what you need, compare with market prices, and see whether you saved or overspent."
        actions={canEdit && <Button onClick={() => setEditing("new")}><Plus /> Add item</Button>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-5"><Stat label="Items needed" value={`${needed.length}`} sub={`Planned total ${s.fmt(plannedTotal)}`} /></Card>
        <Card className="p-5">
          {f.can("view_budget") && s.budget ? (
            <Stat label="Fits this month's budget?" value={plannedTotal <= s.budget.month.remaining ? "Yes" : "Not fully"} tone={plannedTotal <= s.budget.month.remaining ? "green" : "red"} sub={`${s.fmt(s.budget.month.remaining)} left this month`} />
          ) : (
            <Stat label="Budget" value="Hidden" sub="You don't have access to the budget." />
          )}
        </Card>
        <Card className="p-5"><Stat label="Bought vs plan" value={boughtDiff <= 0 ? `${s.fmt(-boughtDiff)} saved` : `${s.fmt(boughtDiff)} over`} tone={boughtDiff <= 0 ? "green" : "red"} sub={`${bought.length} items bought`} /></Card>
      </div>

      <Tabs value={tab} onChange={setTab} className="mb-4" items={[{ value: "needed", label: `Items needed (${needed.length})` }, { value: "bought", label: `Items bought (${bought.length})` }]} />

      <Card>
        <CardContent className="pt-5">
          {tab === "needed" &&
            (needed.length === 0 ? (
              <EmptyState icon={ShoppingBasket} title="Your list is empty" description="Add what you plan to buy. We'll compare it with market prices." action={canEdit ? <Button onClick={() => setEditing("new")}><Plus /> Add item</Button> : undefined} />
            ) : (
              <ul className="divide-y divide-line">
                {needed.map((i) => {
                  const cmp = i.marketProductId ? comparisons.get(i.marketProductId) ?? null : null;
                  const pvm = planVsMarket(i.estimatedUnitPrice, i.quantity, cmp, (n) => s.fmt(n));
                  return (
                    <li key={i.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{i.productName}</p>
                          <Badge tone={i.priority === "high" ? "red" : i.priority === "medium" ? "yellow" : "gray"}>{i.priority} priority</Badge>
                          {i.expectedDate && <span className="text-xs text-muted">by {fmtLocalDate(i.expectedDate, "d MMM")}</span>}
                        </div>
                        <p className="text-xs text-muted">{i.quantity} {i.unit} × {s.fmt(i.estimatedUnitPrice)} · {i.category}</p>
                        {pvm.status !== "no_data" && (
                          <p className={cn("mt-1 flex items-center gap-1 text-xs", pvm.status === "saving_possible" ? "text-brand-dark" : pvm.status === "plan_too_low" ? "text-warn-dark" : "text-muted")}>
                            {pvm.status === "saving_possible" ? <TrendingDown className="size-3.5" /> : pvm.status === "plan_too_low" ? <TrendingUp className="size-3.5" /> : null}
                            {pvm.message} {cmp && <span className="text-muted">(market avg {s.fmt(cmp.average)}/{cmp.unit}; cheapest at {cmp.lowest.marketName} {s.fmt(cmp.lowest.price)})</span>}
                          </p>
                        )}
                      </div>
                      <p className="money text-sm font-semibold sm:w-28 sm:text-right">{s.fmt(i.estimatedUnitPrice * i.quantity)}</p>
                      <div className="flex gap-1">
                        {canBuy && <Button size="sm" variant="soft" onClick={() => setBuying(i)}><CheckCircle2 /> Mark as bought</Button>}
                        {canEdit && <Button size="icon-sm" variant="ghost" onClick={() => setEditing(i)} aria-label={`Edit ${i.productName}`}><Pencil /></Button>}
                        {canEdit && <Button size="icon-sm" variant="ghost" onClick={() => setRemoving(i)} aria-label={`Delete ${i.productName}`}><Trash2 /></Button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ))}
          {tab === "bought" &&
            (bought.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nothing bought yet" description="When you mark an item as bought, it moves here with the price difference." />
            ) : (
              <ul className="divide-y divide-line">
                {bought.map((i) => {
                  const plannedCost = i.estimatedUnitPrice * i.quantity;
                  const diff = (i.actualCost ?? 0) - plannedCost;
                  return (
                    <li key={i.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{i.productName}</p>
                        <p className="text-xs text-muted">
                          {i.quantity} {i.unit} · {i.merchant ?? "—"} · {i.purchasedAt ? fmtDate(i.purchasedAt, s.tz, "d MMM yyyy") : ""}
                          {i.transactionId ? " · linked to a transaction" : " · no transaction recorded"}
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-right text-xs sm:w-96">
                        <div><p className="text-muted">Planned</p><p className="money font-medium">{s.fmt(plannedCost)}</p></div>
                        <div><p className="text-muted">Actual</p><p className="money font-medium">{s.fmt(i.actualCost ?? 0)}</p></div>
                        <div><p className="text-muted">Difference</p><p className={cn("money font-semibold", diff <= 0 ? "text-brand-dark" : "text-danger")}>{diff <= 0 ? `Saved ${s.fmt(-diff)}` : `+${s.fmt(diff)} over`}</p></div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ))}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? "Add item to buy" : "Edit item"}>
          {editing && (
            <ItemForm
              initial={editing === "new" ? null : editing}
              products={f.data.marketProducts}
              comparisons={comparisons}
              fmt={s.fmt}
              tz={s.tz}
              pending={pending}
              onSubmit={async (raw) => {
                const v = shoppingItemSchema.parse(raw);
                await run(
                  (api) =>
                    editing === "new"
                      ? api.create("shoppingItems", { householdId: api.actor.householdId!, listId: listId!, status: "needed", actualCost: null, purchasedAt: null, merchant: null, transactionId: null, addedBy: api.actor.userId, ...v, marketProductId: v.marketProductId ?? null })
                      : api.update("shoppingItems", editing.id, { ...v, marketProductId: v.marketProductId ?? null }),
                  "Item saved.",
                );
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!buying} onOpenChange={(o) => !o && setBuying(null)}>
        <DialogContent title={`Mark “${buying?.productName}” as bought`}>
          {buying && (
            <PurchaseForm
              item={buying}
              fmt={s.fmt}
              tz={s.tz}
              canRecord={f.can("add_transactions")}
              pending={pending}
              onSubmit={async (raw) => {
                const v = purchaseSchema.parse(raw);
                await run(async (api) => {
                  let transactionId: string | null = null;
                  if (v.recordTransaction && api.can("add_transactions")) {
                    const tx = await saveTransaction(
                      api,
                      { type: "expense", title: buying.productName, amount: v.actualCost, date: v.date, time: "12:00", categoryId: /clean|household|personal/i.test(buying.category) ? CAT.household : CAT.groceries, merchant: v.merchant, paymentMethod: v.paymentMethod, essential: true, planned: true, notes: `${buying.quantity} ${buying.unit} from shopping list`, reference: null, recordedBalance: null },
                      { tz: s.tz, currency: s.currency, source: "shopping_list", shoppingItemId: buying.id },
                    );
                    transactionId = tx.id;
                  }
                  await api.update("shoppingItems", buying.id, { status: "bought", actualCost: v.actualCost, merchant: v.merchant, purchasedAt: new Date(`${v.date}T10:00:00Z`).toISOString(), transactionId });
                }, "Moved to Items Bought.");
                setBuying(null);
                setTab("bought");
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.productName}?`}
        description="It will be removed from your shopping list."
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          await run((api) => api.remove("shoppingItems", removing!.id), "Item removed.");
          setRemoving(null);
        }}
      />
    </div>
  );
}

function ItemForm({ initial, products, comparisons, fmt, tz, onSubmit, pending }: { initial: ShoppingItem | null; products: { id: string; name: string; category: string; unit: string }[]; comparisons: Map<string, MarketComparison>; fmt: (n: number) => string; tz: string; onSubmit: (v: ItemValues) => Promise<void>; pending: boolean }) {
  const form = useForm<ItemValues>({
    resolver: zodResolver(shoppingItemSchema),
    defaultValues: initial
      ? { productName: initial.productName, marketProductId: initial.marketProductId ?? null, category: initial.category, quantity: initial.quantity, unit: initial.unit, estimatedUnitPrice: initial.estimatedUnitPrice, priority: initial.priority, expectedDate: initial.expectedDate, notes: initial.notes ?? "" }
      : { productName: "", marketProductId: null, category: "Food", quantity: 1, unit: "kg", estimatedUnitPrice: undefined as unknown as number, priority: "medium", expectedDate: todayLocal(tz), notes: "" },
  });
  const e = form.formState.errors;
  const pid = form.watch("marketProductId");
  const qty = form.watch("quantity") || 0;
  const unitPrice = form.watch("estimatedUnitPrice") || 0;
  const cmp = pid ? comparisons.get(pid) ?? null : null;
  const pvm = unitPrice ? planVsMarket(unitPrice, qty, cmp, fmt) : null;
  const num = { valueAsNumber: true } as const;
  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <Field label="Pick from the market index (optional)" hint="Links the item to market prices for comparisons.">
        <Select
          value={pid ?? ""}
          onChange={(ev) => {
            const p = products.find((x) => x.id === ev.target.value);
            form.setValue("marketProductId", p?.id ?? null);
            if (p) {
              form.setValue("productName", p.name.replace(/ \(.*\)/, ""));
              form.setValue("category", p.category);
              form.setValue("unit", p.unit);
              const c = comparisons.get(p.id);
              if (c && !form.getValues("estimatedUnitPrice")) form.setValue("estimatedUnitPrice", c.average);
            }
          }}
        >
          <option value="">Custom item</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name" error={e.productName?.message} className="sm:col-span-2"><Input {...form.register("productName")} /></Field>
        <Field label="Category"><Select {...form.register("category")}>{MARKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Priority"><Select {...form.register("priority")}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></Select></Field>
        <Field label="Quantity" error={e.quantity?.message}><Input type="number" step="0.1" {...form.register("quantity", num)} /></Field>
        <Field label="Unit" error={e.unit?.message}><Input {...form.register("unit")} placeholder="kg, litre, piece…" /></Field>
        <Field label="Estimated price per unit" error={e.estimatedUnitPrice?.message}><Input type="number" inputMode="numeric" {...form.register("estimatedUnitPrice", num)} /></Field>
        <Field label="Expected purchase date"><Input type="date" {...form.register("expectedDate", { setValueAs: (v: string) => v || null })} /></Field>
      </div>
      <div className="rounded-xl bg-slate-50 p-3 text-sm">
        Estimated total: <strong className="money">{fmt(Math.round(qty * unitPrice))}</strong>
        {pvm && pvm.status !== "no_data" && <p className={cn("mt-1 text-xs", pvm.status === "saving_possible" ? "text-brand-dark" : pvm.status === "plan_too_low" ? "text-warn-dark" : "text-muted")}>{pvm.message}</p>}
      </div>
      <Field label="Notes"><Textarea rows={2} {...form.register("notes")} /></Field>
      <div className="flex justify-end"><Button type="submit" loading={pending}>Save item</Button></div>
    </form>
  );
}

function PurchaseForm({ item, fmt, tz, canRecord, onSubmit, pending }: { item: ShoppingItem; fmt: (n: number) => string; tz: string; canRecord: boolean; onSubmit: (v: PurchaseValues) => Promise<void>; pending: boolean }) {
  const planned = Math.round(item.estimatedUnitPrice * item.quantity);
  const form = useForm<PurchaseValues>({ resolver: zodResolver(purchaseSchema), defaultValues: { actualCost: planned, merchant: "", date: todayLocal(tz), paymentMethod: "momo", recordTransaction: canRecord } });
  const actual = form.watch("actualCost") || 0;
  const diff = actual - planned;
  const e = form.formState.errors;
  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Actual total cost" error={e.actualCost?.message}><Input type="number" inputMode="numeric" {...form.register("actualCost", { valueAsNumber: true })} /></Field>
        <Field label="Where did you buy it?" error={e.merchant?.message}><Input {...form.register("merchant")} placeholder="Kimironko Market" /></Field>
        <Field label="Purchase date"><Input type="date" {...form.register("date")} max={todayLocal(tz)} /></Field>
        <Field label="Payment method"><Select {...form.register("paymentMethod")}>{Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      </div>
      <p className={cn("rounded-xl p-3 text-sm", diff <= 0 ? "bg-brand-light text-brand-dark" : "bg-danger-light text-danger")}>
        Planned {fmt(planned)} → {diff <= 0 ? `you saved ${fmt(-diff)}` : `${fmt(diff)} more than planned`}.
      </p>
      {canRecord ? (
        <Switch checked={!!form.watch("recordTransaction")} onChange={(v) => form.setValue("recordTransaction", v)} label="Also record the expense" description="Creates a linked transaction so your budget updates." />
      ) : (
        <p className="text-xs text-muted">Your role can mark items bought but not record expenses; the owner will see it on the list.</p>
      )}
      <div className="flex justify-end"><Button type="submit" loading={pending}>Mark as bought</Button></div>
    </form>
  );
}
