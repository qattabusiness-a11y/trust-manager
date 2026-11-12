"use client";

import { addDays, format, parseISO } from "date-fns";
import { CAT } from "@/constants";
import type { Api } from "@/lib/data/api";
import type { FinanceData, FinanceSnapshot } from "@/lib/calculations/snapshot";
import { parseMessage } from "@/lib/assistant/parse";
import type { BillDraft, Draft, ParseContext, ParseResult, PriceDraft, QuestionTopic, SavingsDraft, ShoppingDraft, TransactionDraft } from "@/lib/assistant/types";
import { compareProduct, latestPrices } from "@/lib/calculations/market";
import { daysUntil, fmtLocalDate, localToUtcIso, todayLocal } from "@/lib/dates";
import { uuid } from "@/lib/utils";
import type { Language } from "@/stores/display.store";
import type { Permission } from "@/types";
import { savingsTransferService } from "./savings.service";
import { saveTransaction } from "./transaction.service";
import { formatInTimeZone } from "date-fns-tz";
import { isSupabaseConfigured } from "@/config/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/* ---------------------------------------------------------------------
 * Provider contract. Today the built-in rule engine understands messages
 * (offline, deterministic). Later an AI model can implement the same
 * interface — it must return the same Draft objects, which are always
 * confirmed by the person before anything is saved.
 * ------------------------------------------------------------------- */
export interface AssistantProvider {
  readonly name: string;
  interpret(text: string, ctx: ParseContext, lang: Language): Promise<ParseResult>;
}

export class RuleBasedAssistant implements AssistantProvider {
  readonly name = "Built-in assistant";
  async interpret(text: string, ctx: ParseContext): Promise<ParseResult> {
    return parseMessage(text, ctx);
  }
}

async function authHeader(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured()) return {};
  try {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  } catch {
    return {};
  }
}

/**
 * Calls /api/assistant (Google Gemini when GEMINI_API_KEY is set on the
 * server). If no model is configured, the call fails, or the model finds
 * nothing, the built-in engine is used instead, so the assistant always works.
 */
export class RemoteAssistant implements AssistantProvider {
  readonly name = "AI assistant";
  private fallback = new RuleBasedAssistant();
  private disabled = false;
  async interpret(text: string, ctx: ParseContext, lang: Language): Promise<ParseResult> {
    const local = await this.fallback.interpret(text, ctx);
    if (!this.disabled) {
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({
            text,
            language: lang,
            today: ctx.today,
            nowTime: ctx.nowTime,
            goals: ctx.goals,
            products: ctx.products.map((p) => ({ id: p.id, name: p.name, slug: p.slug, unit: p.unit, category: p.category })),
            history: (ctx.history ?? []).slice(-8).map((h) => ({ role: h.role, text: h.text.slice(0, 600) })),
            facts: (ctx.facts ?? []).slice(0, 16).map((x) => x.slice(0, 300)),
          }),
        });
        if (res.ok) {
          const json = (await res.json()) as ParseResult & { configured?: boolean };
          if (json.configured === false) this.disabled = true; // not configured: stop asking
          else if (Array.isArray(json.drafts) && (json.drafts.length || json.questions?.length || json.reply)) {
            return {
              reply: typeof json.reply === "string" ? json.reply : undefined,
              drafts: json.drafts.map((d) => ({ ...d, id: ctx.newId() })),
              questions: json.questions ?? [],
              // The built-in reader also recognises "put it in my database".
              saveRequested: json.saveRequested || local.saveRequested,
            };
          }
        }
      } catch {
        /* network problem — use the built-in engine */
      }
    }
    return local;
  }
}

export const assistantProvider: AssistantProvider = new RemoteAssistant();

export function buildContext(data: FinanceData, tz: string): ParseContext {
  return {
    today: todayLocal(tz),
    nowTime: formatInTimeZone(new Date(), tz, "HH:mm"),
    goals: data.savingsGoals.filter((g) => !g.deletedAt && g.status === "active").map((g) => ({ id: g.id, name: g.name })),
    products: data.marketProducts.filter((p) => !p.deletedAt).map((p) => ({ id: p.id, name: p.name, slug: p.slug, unit: p.unit, category: p.category })),
    newId: uuid,
  };
}

/* ---------------------------------------------------------------------
 * Permissions needed to save each kind of draft.
 * ------------------------------------------------------------------- */
export function permissionFor(d: Draft): Permission {
  switch (d.kind) {
    case "transaction":
      return "add_transactions";
    case "savings":
      return "manage_savings";
    case "shopping":
    case "price":
      return "edit_shopping";
    case "bill":
      return "manage_recurring";
  }
}

export function draftIsComplete(d: Draft): boolean {
  switch (d.kind) {
    case "transaction":
      return !!d.amount && d.amount > 0 && d.title.trim().length >= 2 && !!d.categoryId && !!d.date;
    case "savings":
      return !!d.amount && d.amount > 0;
    case "shopping":
      return d.productName.trim().length >= 2 && d.quantity > 0 && !!d.estimatedUnitPrice && d.estimatedUnitPrice > 0;
    case "price":
      return d.productName.trim().length >= 2 && !!d.price && d.price > 0 && d.marketName.trim().length >= 2;
    case "bill":
      return d.name.trim().length >= 2 && !!d.amount && d.amount > 0 && !!d.nextDueDate;
  }
}

export const DRAFT_HREF: Record<Draft["kind"], string> = {
  transaction: "/transactions",
  savings: "/savings",
  shopping: "/shopping",
  price: "/market",
  bill: "/bills",
};

/** Fill in what we can from the household's own records (e.g. a planned price from recorded market prices). */
export function enrichDrafts(drafts: Draft[], data: FinanceData, currency: string): Draft[] {
  const current = latestPrices(data.marketProducts, data.marketHistory, currency);
  return drafts.map((d) => {
    if (d.kind === "shopping" && d.estimatedUnitPrice == null && d.marketProductId) {
      const product = data.marketProducts.find((p) => p.id === d.marketProductId);
      const cmp = product ? compareProduct(product, current, data.marketHistory) : null;
      if (cmp) return { ...d, estimatedUnitPrice: cmp.average, note: "Price from your recorded market prices" };
    }
    if (d.kind === "savings" && !d.goalId) {
      const goal = data.savingsGoals.find((g) => !g.deletedAt && g.status === "active" && /emergency/i.test(g.name)) ?? data.savingsGoals.find((g) => !g.deletedAt && g.status === "active");
      if (goal) return { ...d, goalId: goal.id, goalName: goal.name };
    }
    return d;
  });
}

/* ---------------------------------------------------------------------
 * Saving. Each draft goes to its own module through the same
 * permission-checked API the forms use, so budgets, balances, alerts and
 * analytics are recalculated automatically from the new records.
 * ------------------------------------------------------------------- */
export interface ApplyEnv {
  tz: string;
  currency: string;
  data: FinanceData;
  recorderName: string;
}

export async function applyDraft(api: Api, d: Draft, env: ApplyEnv): Promise<void> {
  if (!api.can(permissionFor(d))) throw new Error("Your role can't do this in this household.");
  if (!draftIsComplete(d)) throw new Error("Some details are missing.");
  const householdId = api.actor.householdId!;
  switch (d.kind) {
    case "transaction": {
      const t = d as TransactionDraft;
      await saveTransaction(
        api,
        {
          type: t.type,
          title: t.title.trim(),
          amount: t.amount!,
          date: t.date,
          time: t.time,
          categoryId: t.categoryId,
          merchant: t.merchant.trim(),
          paymentMethod: t.paymentMethod,
          essential: t.essential,
          planned: t.planned,
          notes: "Recorded with Trust Assistant",
          reference: t.reference ?? null,
          recordedBalance: t.recordedBalance ?? null,
        },
        { tz: env.tz, currency: env.currency, source: "manual" },
      );
      return;
    }
    case "savings": {
      const s = d as SavingsDraft;
      let accountId: string | null = null;
      let goalId = s.goalId;
      if (goalId) accountId = env.data.savingsGoals.find((g) => g.id === goalId)?.accountId ?? null;
      if (!accountId) {
        const acc = env.data.savingsAccounts.find((a) => !a.deletedAt && a.kind === "emergency") ?? env.data.savingsAccounts.find((a) => !a.deletedAt && a.kind !== "micro") ?? null;
        accountId = acc?.id ?? (await api.create("savingsAccounts", { householdId, name: "General savings", kind: "general", openingBalance: 0 })).id;
        if (goalId && !env.data.savingsGoals.some((g) => g.id === goalId)) goalId = null;
      }
      await savingsTransferService.transfer(api, { amount: s.amount!, accountId, goalId, source: "manual", note: "Recorded with Trust Assistant" });
      return;
    }
    case "shopping": {
      const s = d as ShoppingDraft;
      const lists = await api.list("shoppingLists");
      const listId = lists[0]?.id ?? (await api.create("shoppingLists", { householdId, name: "Household essentials" })).id;
      await api.create("shoppingItems", {
        householdId,
        listId,
        productName: s.productName.trim(),
        marketProductId: s.marketProductId,
        category: s.category,
        quantity: s.quantity,
        unit: s.unit,
        estimatedUnitPrice: s.estimatedUnitPrice!,
        priority: s.priority,
        expectedDate: format(addDays(parseISO(todayLocal(env.tz)), 3), "yyyy-MM-dd"),
        notes: "Added with Trust Assistant",
        status: "needed",
        actualCost: null,
        purchasedAt: null,
        merchant: null,
        transactionId: null,
        addedBy: api.actor.userId,
      });
      return;
    }
    case "price": {
      const p = d as PriceDraft;
      let productId = p.marketProductId;
      if (!productId) {
        const existing = env.data.marketProducts.find((x) => x.name.toLowerCase() === p.productName.trim().toLowerCase());
        productId =
          existing?.id ??
          (await api.create("marketProducts", { householdId, slug: `h-${uuid().slice(0, 8)}`, name: p.productName.trim(), category: "Food", unit: p.unit, perishable: false, shelfLifeDays: 365 } as never)).id;
      }
      const isToday = p.date === todayLocal(env.tz);
      await api.create("marketPriceHistory", {
        householdId,
        recordedBy: api.actor.userId,
        productId,
        marketName: p.marketName.trim(),
        location: "",
        price: p.price!,
        currency: env.currency,
        recordedAt: isToday ? new Date().toISOString() : localToUtcIso(p.date, "12:00", env.tz),
        source: `Recorded by ${env.recorderName}`,
        note: "Recorded with Trust Assistant",
      } as never);
      return;
    }
    case "bill": {
      const b = d as BillDraft;
      await api.create("recurringPayments", {
        householdId,
        name: b.name.trim(),
        amount: b.amount!,
        category: b.category,
        kind: b.billKind,
        frequency: b.frequency,
        nextDueDate: b.nextDueDate,
        renewalDate: b.billKind === "subscription" ? b.nextDueDate : null,
        endDate: null,
        reminderDays: [7, 3, 1],
        status: "active",
        essential: b.essential,
      });
      return;
    }
  }
}

/* ---------------------------------------------------------------------
 * Answers to questions, computed from the same snapshot the dashboard uses.
 * ------------------------------------------------------------------- */
/** Topics summarised for the AI model so it can talk about the household's money. */
export const FACT_TOPICS: QuestionTopic[] = ["balance", "spent_today", "spent_week", "spent_month", "budget_left", "safe_today", "savings", "top_category", "bills_due", "run_out", "income_month"];

export function answer(topic: QuestionTopic, s: FinanceSnapshot, data: FinanceData, can: (p: Permission) => boolean, lang: Language): string {
  const rw = lang === "rw";
  const fmt = (n: number) => s.fmt(n);
  const noAccess = rw ? "Uruhare rwawe ntirukwemerera kubona aya makuru." : "Your role doesn't allow you to see this.";
  const b = s.budget;
  switch (topic) {
    case "about":
      return rw
        ? "Ndi Trust Assistant, umufasha wa Trust Manager. Trust Manager yakozwe na Qatta Yves."
        : "I'm Trust Assistant, the helper inside Trust Manager. Trust Manager was developed by Qatta Yves.";
    case "spent_today":
      if (!can("view_transactions") || !b) return noAccess;
      return rw ? `Uyu munsi wakoresheje ${fmt(b.day.spent)} ku rugero rwa ${fmt(b.limits.daily)}.` : `Today you've spent ${fmt(b.day.spent)} of your ${fmt(b.limits.daily)} daily limit.`;
    case "spent_week":
      if (!can("view_transactions") || !b) return noAccess;
      return rw
        ? `Iki cyumweru wakoresheje ${fmt(b.week.spent)} kuri ${fmt(b.week.limit)} (${Math.round(b.week.usedPct)}%).`
        : `This week you've spent ${fmt(b.week.spent)} of ${fmt(b.week.limit)} (${Math.round(b.week.usedPct)}%).${b.week.over ? ` That's ${fmt(b.week.over)} over the limit.` : ""}`;
    case "spent_month":
      if (!can("view_transactions") || !b) return noAccess;
      return rw
        ? `Uku kwezi wakoresheje ${fmt(b.month.spent)} kuri ${fmt(b.month.limit)}. Hasigaye ${fmt(b.month.remaining)} mu minsi ${b.daysLeft}.`
        : `This month you've spent ${fmt(b.month.spent)} of ${fmt(b.month.limit)}. ${fmt(b.month.remaining)} is left for the next ${b.daysLeft} day${b.daysLeft === 1 ? "" : "s"}.`;
    case "budget_left":
      if (!can("view_budget") || !b) return noAccess;
      return rw
        ? `Mu ngengo y'uku kwezi hasigaye ${fmt(b.month.remaining)}. Ushobora gukoresha nka ${fmt(b.recommendedDaily)} ku munsi.`
        : `${fmt(b.month.remaining)} is left in this month's budget — about ${fmt(b.recommendedDaily)} a day.`;
    case "safe_today":
      if (!can("view_budget") || !b) return noAccess;
      return rw
        ? `Uyu munsi ushobora gukoresha nka ${fmt(Math.max(0, Math.min(b.recommendedDaily, b.limits.daily) - b.day.spent))}.`
        : `You can safely spend about ${fmt(Math.max(0, Math.min(b.recommendedDaily, b.limits.daily) - b.day.spent))} more today.`;
    case "balance":
      if (!can("view_balances")) return noAccess;
      return rw ? `Amafaranga ahari yanditswe muri Trust Manager ni ${fmt(s.balance)}.` : `Your recorded available money is ${fmt(s.balance)}.`;
    case "savings":
      if (!can("view_balances")) return noAccess;
      return rw ? `Ubwizigame bwose ni ${fmt(s.savings)}. Uku kwezi wazigamye ${fmt(s.savingsThisMonth)}.` : `Total savings: ${fmt(s.savings)}. Saved this month: ${fmt(s.savingsThisMonth)}.`;
    case "income_month": {
      if (!can("view_income") && !can("view_transactions")) return noAccess;
      const m = s.incomeVsExpenses.at(-1);
      return rw ? `Uku kwezi hinjiye ${fmt(m?.income ?? 0)}, hasohoka ${fmt(m?.expenses ?? 0)}.` : `This month: ${fmt(m?.income ?? 0)} came in and ${fmt(m?.expenses ?? 0)} went out.`;
    }
    case "top_category": {
      if (!can("view_transactions")) return noAccess;
      const top = s.categoryBreakdown.slice(0, 3);
      if (!top.length) return rw ? "Nta ikoreshwa riranditswe uku kwezi." : "No spending recorded this month yet.";
      return (rw ? "Aho amafaranga menshi ajya uku kwezi: " : "Where most of your money went this month: ") + top.map((c) => `${c.name} ${fmt(c.amount)}`).join(", ") + ".";
    }
    case "top_payee": {
      if (!can("view_transactions")) return noAccess;
      const totals = new Map<string, number>();
      for (const t of data.transactions) if (!t.deletedAt && t.type === "expense" && t.merchant) totals.set(t.merchant, (totals.get(t.merchant) ?? 0) + t.amount);
      const top = [...totals.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 3);
      if (!top.length) return rw ? "Nta wishyuwe uranditswe." : "No payees recorded yet.";
      return (rw ? "Abo wishyura menshi: " : "Who receives most of your money: ") + top.map(([m, v]) => `${m} ${fmt(v)}`).join(", ") + ".";
    }
    case "bills_due": {
      if (!can("view_budget")) return noAccess;
      const due = data.recurring.filter((r) => !r.deletedAt && r.status === "active").sort((a, c) => a.nextDueDate.localeCompare(c.nextDueDate)).slice(0, 3);
      if (!due.length) return rw ? "Nta fagitire zanditswe." : "No bills recorded yet. Tell me e.g. “Rent is 200,000 every month due on the 5th”.";
      return (rw ? "Fagitire zikurikira: " : "Next bills: ") + due.map((r) => `${r.name} ${fmt(r.amount)} — ${fmtLocalDate(r.nextDueDate, "d MMM")} (${daysUntil(r.nextDueDate, s.tz)}d)`).join("; ") + ".";
    }
    case "run_out": {
      if (!can("view_balances")) return noAccess;
      const p = s.prediction;
      if (p.status !== "ok") return rw ? "Nta makuru ahagije yo kubara. Andika ibikorwa by'iminsi 7 nibura." : "Not enough data to calculate yet — record about a week of spending first.";
      if (!p.projectedZeroDate) return rw ? "Ukurikije uko ukoresha ubu, amafaranga ntazashira mu minsi 120 iri imbere (ni igereranya)." : "At your current pace your money isn't projected to run out in the next 120 days (estimate).";
      return rw
        ? `Nukomeza gukoresha ${fmt(p.dailyBurnRate)} ku munsi, amafaranga ashobora gushira nko ku wa ${fmtLocalDate(p.projectedZeroDate, "d MMM")} (ni igereranya).`
        : `At about ${fmt(p.dailyBurnRate)} a day, your available money may run out around ${fmtLocalDate(p.projectedZeroDate, "d MMMM")}. This is an estimate, not a certainty.`;
    }
    case "help":
    default:
      return rw
        ? "Nshobora kwandika ibyo wakoresheje, ibyo winjije, ubwizigame, ibyo kugura, ibiciro byo ku isoko na fagitire. Urugero: “Nakoresheje 2,000 kuri moto”, “Nahembwe 250,000”, “Nkeneye kugura umuceri 10kg”, “Umuceri ni 1,300 ku kilo i Kimironko”, “Ubukode ni 200,000 buri kwezi tariki ya 5”. Ushobora no kumbaza “Nakoresheje angahe iki cyumweru?”"
        : "I can record expenses, income, savings, shopping items, market prices and bills. Try “Spent 2,000 on moto”, “Received 250,000 salary”, “Need to buy 10kg rice”, “Rice is 1,300 per kg at Kimironko”, “Rent is 200,000 every month due on the 5th”. You can also ask “How much did I spend this week?” or “When will my money run out?”";
  }
}

export const INCOME_CATEGORY_IDS = [CAT.salary, CAT.freelance, CAT.business, CAT.incomeOther];
