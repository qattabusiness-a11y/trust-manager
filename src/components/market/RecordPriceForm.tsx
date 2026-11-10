"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch } from "@/components/ui/inputs";
import { MARKET_CATEGORIES } from "@/constants";
import { useAction } from "@/hooks/use-data";
import { localToUtcIso, todayLocal } from "@/lib/dates";
import type { MarketPricePoint, MarketProduct } from "@/types";

export const KNOWN_MARKETS = [
  { name: "Kimironko Market", location: "Gasabo, Kigali" },
  { name: "Nyabugogo Market", location: "Nyarugenge, Kigali" },
  { name: "Kicukiro Centre Market", location: "Kicukiro, Kigali" },
  { name: "Simba Supermarket", location: "Kigali" },
  { name: "Sawa Citi", location: "Kigali" },
  { name: "Musanze Market", location: "Musanze" },
];

const NEW = "__new__";

const schema = z
  .object({
    productId: z.string().min(1, "Choose a product"),
    newName: z.string().trim().max(60),
    newCategory: z.string(),
    newUnit: z.string().trim().max(20),
    newPerishable: z.boolean(),
    marketName: z.string().trim().min(2, "Where did you see this price?").max(60),
    location: z.string().trim().max(60),
    price: z.number({ message: "Enter the price" }).int("Whole numbers only").positive("Enter the price").max(100_000_000),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    note: z.string().max(200),
  })
  .refine((v) => v.productId !== NEW || v.newName.length >= 2, { message: "Name the product", path: ["newName"] })
  .refine((v) => v.productId !== NEW || v.newUnit.length >= 1, { message: "kg, litre, piece…", path: ["newUnit"] });
type Values = z.infer<typeof schema>;

/** Record a real price the household saw or paid. Saved with date, place and who recorded it. */
export function RecordPriceForm({
  products,
  history,
  tz,
  currency,
  recorderName,
  defaultProductId,
  onDone,
}: {
  products: MarketProduct[];
  history: MarketPricePoint[];
  tz: string;
  currency: string;
  recorderName: string;
  defaultProductId?: string;
  onDone: () => void;
}) {
  const { run, pending } = useAction();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { productId: defaultProductId ?? "", newName: "", newCategory: "Food", newUnit: "kg", newPerishable: false, marketName: "", location: "", price: undefined as unknown as number, date: todayLocal(tz), note: "" },
  });
  const e = form.formState.errors;
  const productId = form.watch("productId");
  const product = products.find((p) => p.id === productId);
  const markets = [...new Map([...KNOWN_MARKETS, ...history.filter((h) => h.householdId).map((h) => ({ name: h.marketName, location: h.location }))].map((m) => [m.name.toLowerCase(), m])).values()];

  async function submit(v: Values) {
    await run(async (api) => {
      const householdId = api.actor.householdId!;
      let pid = v.productId;
      if (pid === NEW) {
        const created = await api.create("marketProducts", {
          householdId,
          slug: `h-${crypto.randomUUID().slice(0, 8)}`,
          name: v.newName,
          category: v.newCategory,
          unit: v.newUnit,
          perishable: v.newPerishable,
          shelfLifeDays: v.newPerishable ? 7 : 365,
        });
        pid = created.id;
      }
      const isToday = v.date === todayLocal(tz);
      await api.create("marketPriceHistory", {
        householdId,
        recordedBy: api.actor.userId,
        productId: pid,
        marketName: v.marketName,
        location: v.location || markets.find((m) => m.name.toLowerCase() === v.marketName.toLowerCase())?.location || "",
        price: v.price,
        currency,
        recordedAt: isToday ? new Date().toISOString() : localToUtcIso(v.date, "12:00", tz),
        source: `Recorded by ${recorderName}`,
        note: v.note || null,
      } as never);
    }, "Price saved. Comparisons now use your real prices.");
    onDone();
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(submit)} noValidate>
      <Field label="Product" error={e.productId?.message}>
        <Select {...form.register("productId")}>
          <option value="">Choose…</option>
          {[...products].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
            <option key={p.id} value={p.id}>{p.name} (per {p.unit})</option>
          ))}
          <option value={NEW}>+ Add a new product…</option>
        </Select>
      </Field>
      {productId === NEW && (
        <div className="grid gap-4 rounded-xl border border-line p-3 sm:grid-cols-2">
          <Field label="Product name" error={e.newName?.message} className="sm:col-span-2"><Input {...form.register("newName")} placeholder="e.g. Sweet potatoes" /></Field>
          <Field label="Category"><Select {...form.register("newCategory")}>{MARKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Sold per" error={e.newUnit?.message}><Input {...form.register("newUnit")} placeholder="kg, litre, piece…" /></Field>
          <div className="sm:col-span-2"><Switch checked={form.watch("newPerishable")} onChange={(v) => form.setValue("newPerishable", v)} label="Spoils quickly" description="Fresh food that can't be stored for weeks. Never suggested for bulk buying." /></div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Market or shop" error={e.marketName?.message}>
          <Input {...form.register("marketName")} list="tm-markets" placeholder="Kimironko Market" autoComplete="off" />
          <datalist id="tm-markets">{markets.map((m) => <option key={m.name} value={m.name} />)}</datalist>
        </Field>
        <Field label="Area (optional)"><Input {...form.register("location")} placeholder="Gasabo, Kigali" /></Field>
        <Field label={`Price (${currency})${product ? ` per ${product.unit}` : ""}`} error={e.price?.message}><Input type="number" inputMode="numeric" {...form.register("price", { valueAsNumber: true })} /></Field>
        <Field label="Date seen" error={e.date?.message}><Input type="date" max={todayLocal(tz)} {...form.register("date")} /></Field>
      </div>
      <Field label="Note (optional)"><Input {...form.register("note")} placeholder="e.g. price for 25 kg sack, divided" /></Field>
      <div className="flex justify-end"><Button type="submit" loading={pending}>Save price</Button></div>
    </form>
  );
}
