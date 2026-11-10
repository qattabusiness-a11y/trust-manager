"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ScanLine } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/inputs";
import { Tabs } from "@/components/ui/misc";
import { PAYMENT_METHOD_LABELS } from "@/constants";
import { useAction, useList } from "@/hooks/use-data";
import { useFinance } from "@/hooks/use-finance";
import { useSession } from "@/hooks/use-session";
import { fmtDate } from "@/lib/dates";
import { localDate, todayLocal } from "@/lib/dates";
import { transactionInputSchema, type TransactionInput } from "@/lib/validations";
import { saveTransaction, ValidationError } from "@/services/transaction.service";
import { useUIStore } from "@/stores/preferences.store";
import type { Transaction } from "@/types";
import { formatInTimeZone } from "date-fns-tz";

export function TransactionForm({
  initial,
  defaults,
  tz,
  currency,
  onDone,
  source,
  shoppingItemId,
  lockType,
}: {
  initial?: Transaction | null;
  defaults?: Partial<TransactionInput>;
  tz: string;
  currency: string;
  onDone: (tx: Transaction) => void;
  source?: Transaction["source"];
  shoppingItemId?: string | null;
  /** Hide the expense/income switch (e.g. when the type came from a receipt). */
  lockType?: boolean;
}) {
  const { run, pending } = useAction();
  const categories = useList("categories");
  const session = useSession();
  const { household } = useFinance();
  const openReceipt = useUIStore((s) => s.setReceiptOpen);
  const setQuickAdd = useUIStore((s) => s.setQuickAdd);

  const form = useForm<TransactionInput>({
    resolver: zodResolver(transactionInputSchema),
    defaultValues: initial
      ? {
          type: initial.type,
          title: initial.title,
          amount: initial.amount,
          date: localDate(initial.occurredAt, tz),
          time: formatInTimeZone(new Date(initial.occurredAt), tz, "HH:mm"),
          categoryId: initial.categoryId,
          merchant: initial.merchant,
          paymentMethod: initial.paymentMethod,
          essential: initial.essential,
          planned: initial.planned,
          notes: initial.notes ?? "",
          reference: initial.reference ?? null,
          recordedBalance: initial.recordedBalance ?? null,
        }
      : {
          type: "expense",
          title: "",
          amount: undefined as unknown as number,
          date: todayLocal(tz),
          time: formatInTimeZone(new Date(), tz, "HH:mm"),
          categoryId: "",
          merchant: "",
          paymentMethod: "momo",
          essential: true,
          planned: true,
          notes: "",
          reference: null,
          recordedBalance: null,
          ...defaults,
        },
  });
  const { register, watch, setValue, formState, handleSubmit, setError } = form;
  const e = formState.errors;
  const type = watch("type");
  const categoryId = watch("categoryId");
  const kind = type === "income" ? "income" : "expense";
  const options = (categories.data ?? []).filter((c) => c.kind === kind && c.name !== "Savings");

  // Category drives the default essential flag; the user can still change it.
  useEffect(() => {
    const c = categories.data?.find((c) => c.id === categoryId);
    if (c && !initial) setValue("essential", c.essential);
  }, [categoryId, categories.data, initial, setValue]);

  async function submit(values: TransactionInput) {
    try {
      const tx = await run(
        (api) => saveTransaction(api, values, { id: initial?.id, tz, currency, source, shoppingItemId }),
        initial ? "Transaction updated (change recorded in audit log)." : "Transaction saved.",
      );
      onDone(tx);
    } catch (err) {
      if (err instanceof ValidationError) for (const i of err.issues) setError((i.path || "title") as keyof TransactionInput, { message: i.message });
    }
  }

  const canSave = initial ? session.can("edit_transactions") : session.can("add_transactions");

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      {!initial && !lockType && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs
            value={type === "income" ? "income" : "expense"}
            onChange={(v) => {
              setValue("type", v);
              setValue("categoryId", "");
            }}
            items={[
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
            ]}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setQuickAdd(false);
              openReceipt(true);
            }}
          >
            <ScanLine /> Scan a receipt instead
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" error={e.title?.message} className="sm:col-span-2">
          <Input {...register("title")} placeholder={kind === "income" ? "e.g. Salary" : "e.g. Weekly groceries"} aria-invalid={!!e.title} />
        </Field>
        <Field label={`Amount (${currency})`} error={e.amount?.message}>
          <Input type="number" inputMode="numeric" min={1} {...register("amount", { valueAsNumber: true })} aria-invalid={!!e.amount} />
        </Field>
        <Field label="Category" error={e.categoryId?.message}>
          <Select {...register("categoryId")} aria-invalid={!!e.categoryId}>
            <option value="">Choose…</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date" error={e.date?.message}>
          <Input type="date" {...register("date")} max={todayLocal(tz)} />
        </Field>
        <Field label="Time" error={e.time?.message}>
          <Input type="time" {...register("time")} />
        </Field>
        <Field label={kind === "income" ? "Paid by" : "Merchant / payee"} error={e.merchant?.message}>
          <Input {...register("merchant")} placeholder={kind === "income" ? "Employer, client…" : "Simba, Kimironko Market…"} />
        </Field>
        <Field label="Payment method">
          <Select {...register("paymentMethod")}>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </Select>
        </Field>
      </div>
      {kind === "expense" && (
        <div className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
          <Switch checked={watch("essential")} onChange={(v) => setValue("essential", v)} label="Essential" description="Needed to live: food, rent, health, school." />
          <Switch checked={watch("planned")} onChange={(v) => setValue("planned", v)} label="Planned" description="Was this in your plan or shopping list?" />
        </div>
      )}
      <Field label="Notes (optional)">
        <Textarea {...register("notes")} rows={2} />
      </Field>
      {(() => {
        const start = household?.openingBalanceDate;
        const d = watch("date");
        if (!start || !d || d >= localDate(start, tz)) return null;
        return (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-muted">
            This is dated before you started tracking on {fmtDate(start, tz, "d MMM yyyy")}. It will appear in your history and charts, but it won&apos;t change your available balance — that money was already spent when you entered your starting balance.
          </p>
        );
      })()}
      {!canSave && <p className="text-xs text-danger">Your role can&apos;t {initial ? "edit" : "add"} transactions in this household.</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" loading={pending} disabled={!canSave}>
          {initial ? "Save changes" : "Save transaction"}
        </Button>
      </div>
    </form>
  );
}
