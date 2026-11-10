"use client";

import { AlertTriangle, CalendarClock, Check, Loader2, PiggyBank, Receipt, ShoppingBasket, Store, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import { Input, Select } from "@/components/ui/inputs";
import { PAYMENT_METHOD_LABELS } from "@/constants";
import { useT } from "@/i18n";
import type { Draft } from "@/lib/assistant/types";
import { cn } from "@/lib/utils";
import { DRAFT_HREF, draftIsComplete } from "@/services/assistant.service";
import type { DraftStatus } from "@/stores/assistant.store";
import type { TransactionCategory } from "@/types";

const ICON = { transaction: Receipt, savings: PiggyBank, shopping: ShoppingBasket, price: Store, bill: CalendarClock };

function Small({ label, children, wide, missing }: { label: string; children: React.ReactNode; wide?: boolean; missing?: boolean }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-0.5", wide && "col-span-2")}>
      <span className={cn("text-[10px] font-medium uppercase tracking-wide", missing ? "text-danger" : "text-muted")}>{label}</span>
      {children}
    </label>
  );
}

const box = "h-8 px-2 text-xs";

export function DraftCard({
  draft,
  status,
  error,
  categories,
  goals,
  currency,
  allowed,
  onChange,
  onToggle,
}: {
  draft: Draft;
  status: DraftStatus;
  error?: string;
  categories: TransactionCategory[];
  goals: { id: string; name: string }[];
  currency: string;
  allowed: boolean;
  onChange: (d: Draft) => void;
  onToggle: () => void;
}) {
  const t = useT();
  const Icon = draft.kind === "transaction" && draft.type === "income" ? TrendingUp : ICON[draft.kind];
  const kindLabel = draft.kind === "transaction" ? t(draft.type === "income" ? "ai.kind.income" : "ai.kind.expense") : t(`ai.kind.${draft.kind}` as const);
  const locked = status === "saving" || status === "saved";
  const complete = draftIsComplete(draft);
  const num = (v: string) => (v === "" ? null : Math.max(0, Math.round(Number(v))));
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch } as Draft);
  const amountMissing = "amount" in draft && !draft.amount;

  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-3 text-xs shadow-sm transition-opacity",
        status === "saved" ? "border-brand/40 bg-brand-light/30" : status === "error" ? "border-danger/50" : draft.include ? "border-line" : "border-dashed border-line opacity-60",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("flex size-6 items-center justify-center rounded-md", draft.kind === "transaction" && draft.type === "expense" ? "bg-slate-100 text-navy" : "bg-brand-light text-brand-dark")}>
          <Icon className="size-3.5" />
        </span>
        <span className="font-semibold text-navy">{kindLabel}</span>
        {draft.kind === "transaction" && draft.duplicateOf && <span className="rounded bg-warn-light px-1.5 py-0.5 text-[10px] text-warn-dark">{t("ai.duplicate")}</span>}
        <span className="ml-auto flex items-center gap-1">
          {status === "saving" && <Loader2 className="size-3.5 animate-spin text-muted" />}
          {status === "saved" && (
            <Link href={DRAFT_HREF[draft.kind]} className="flex items-center gap-1 font-semibold text-brand-dark hover:underline">
              <Check className="size-3.5" /> {t("ai.saved")} · {t("ai.view")}
            </Link>
          )}
          {!locked && (
            <button type="button" onClick={onToggle} className="rounded px-1.5 py-0.5 text-muted hover:bg-slate-100" aria-label={draft.include ? t("ai.remove") : t("ai.include")}>
              {draft.include ? <X className="size-3.5" /> : t("ai.include")}
            </button>
          )}
        </span>
      </div>

      <fieldset disabled={locked || !draft.include} className="grid grid-cols-2 gap-2">
        {draft.kind === "transaction" && (
          <>
            <Small label={t("ai.field.name")} wide missing={draft.title.trim().length < 2}>
              <Input className={box} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
            </Small>
            <Small label={`${t("ai.field.amount")} (${currency})`} missing={amountMissing}>
              <Input className={box} type="number" inputMode="numeric" value={draft.amount ?? ""} onChange={(e) => set({ amount: num(e.target.value) })} aria-invalid={amountMissing} />
            </Small>
            <Small label={t("ai.field.date")}>
              <Input className={box} type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
            </Small>
            <Small label={t("ai.field.category")}>
              <Select className={box} value={draft.categoryId} onChange={(e) => {
                const c = categories.find((x) => x.id === e.target.value);
                set({ categoryId: e.target.value, essential: c ? c.essential : draft.essential });
              }}>
                {categories.filter((c) => c.kind === (draft.type === "income" ? "income" : "expense") && c.name !== "Savings").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Small>
            <Small label={t("ai.field.method")}>
              <Select className={box} value={draft.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value as never })}>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l.replace(" (MoMo)", "")}</option>)}
              </Select>
            </Small>
            <Small label={draft.type === "income" ? t("ai.field.from") : t("ai.field.payee")} wide>
              <Input className={box} value={draft.merchant} onChange={(e) => set({ merchant: e.target.value })} />
            </Small>
          </>
        )}

        {draft.kind === "savings" && (
          <>
            <Small label={`${t("ai.field.amount")} (${currency})`} missing={amountMissing}>
              <Input className={box} type="number" inputMode="numeric" value={draft.amount ?? ""} onChange={(e) => set({ amount: num(e.target.value) })} />
            </Small>
            <Small label={t("ai.field.goal")}>
              <Select className={box} value={draft.goalId ?? ""} onChange={(e) => set({ goalId: e.target.value || null, goalName: goals.find((g) => g.id === e.target.value)?.name ?? null })}>
                <option value="">General savings</option>
                {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </Small>
          </>
        )}

        {draft.kind === "shopping" && (
          <>
            <Small label={t("ai.field.name")} wide>
              <Input className={box} value={draft.productName} onChange={(e) => set({ productName: e.target.value })} />
            </Small>
            <Small label={`${t("ai.field.qty")} (${draft.unit})`}>
              <Input className={box} type="number" step="0.1" value={draft.quantity} onChange={(e) => set({ quantity: Math.max(0, Number(e.target.value)) })} />
            </Small>
            <Small label={`${t("ai.field.unitPrice")} (${currency})`} missing={!draft.estimatedUnitPrice}>
              <Input className={box} type="number" inputMode="numeric" value={draft.estimatedUnitPrice ?? ""} placeholder={t("ai.needed")} onChange={(e) => set({ estimatedUnitPrice: num(e.target.value) })} />
            </Small>
          </>
        )}

        {draft.kind === "price" && (
          <>
            <Small label={t("ai.field.name")} missing={draft.productName.trim().length < 2}>
              <Input className={box} value={draft.productName} onChange={(e) => set({ productName: e.target.value })} />
            </Small>
            <Small label={`${t("ai.field.price")} / ${draft.unit}`} missing={!draft.price}>
              <Input className={box} type="number" inputMode="numeric" value={draft.price ?? ""} onChange={(e) => set({ price: num(e.target.value) })} />
            </Small>
            <Small label={t("ai.field.market")} missing={draft.marketName.trim().length < 2}>
              <Input className={box} value={draft.marketName} placeholder={t("ai.needed")} onChange={(e) => set({ marketName: e.target.value })} />
            </Small>
            <Small label={t("ai.field.date")}>
              <Input className={box} type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
            </Small>
          </>
        )}

        {draft.kind === "bill" && (
          <>
            <Small label={t("ai.field.name")} wide>
              <Input className={box} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </Small>
            <Small label={`${t("ai.field.amount")} (${currency})`} missing={amountMissing}>
              <Input className={box} type="number" inputMode="numeric" value={draft.amount ?? ""} onChange={(e) => set({ amount: num(e.target.value) })} />
            </Small>
            <Small label={t("ai.field.every")}>
              <Select className={box} value={draft.frequency} onChange={(e) => set({ frequency: e.target.value as never })}>
                <option value="weekly">week</option>
                <option value="monthly">month</option>
                <option value="quarterly">term / 3 months</option>
                <option value="yearly">year</option>
              </Select>
            </Small>
            <Small label={t("ai.field.nextDue")} wide>
              <Input className={box} type="date" value={draft.nextDueDate} onChange={(e) => set({ nextDueDate: e.target.value })} />
            </Small>
          </>
        )}
      </fieldset>

      {draft.note && <p className="mt-2 text-[11px] text-muted">{draft.note}</p>}
      {!allowed && <p className="mt-2 text-[11px] text-danger">{t("ai.noPermission")}</p>}
      {allowed && draft.include && !complete && status !== "saved" && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-warn-dark"><AlertTriangle className="size-3" /> {t("ai.needed")}</p>
      )}
      {status === "error" && error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
    </div>
  );
}
