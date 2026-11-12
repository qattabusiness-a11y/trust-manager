import { z } from "zod";
import { CAT, SYSTEM_CATEGORIES } from "@/constants";
import { guessCategory } from "./parse";
import type { Draft, ParseResult, QuestionTopic } from "./types";

/**
 * Shared between the /api/assistant route and its tests: what we ask an AI
 * model for, and how its answer is turned into the app's own drafts.
 * The model never sees balances or history, only the message, today's date,
 * savings-goal names and product names. Every answer is checked here before
 * the app uses it, and the app's normal validation runs again on save.
 */

export const AI_QUESTION_TOPICS = [
  "spent_today", "spent_week", "spent_month", "balance", "budget_left", "safe_today",
  "savings", "top_category", "top_payee", "bills_due", "run_out", "income_month", "help",
] as const satisfies readonly QuestionTopic[];

export const AI_CATEGORY_KEYS = Object.keys(CAT) as (keyof typeof CAT)[];
const PAYMENT = ["momo", "bank", "cash", "card", "other"] as const;
const FREQ = ["weekly", "monthly", "quarterly", "yearly"] as const;
const KINDS = ["expense", "income", "savings", "shopping", "price", "bill"] as const;

/** Request body the app sends to /api/assistant. */
export const assistantRequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  language: z.enum(["en", "rw"]).default("en"),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nowTime: z.string().regex(/^\d{2}:\d{2}$/).default("12:00"),
  goals: z.array(z.object({ id: z.string().max(64), name: z.string().max(120) })).max(50).default([]),
  products: z
    .array(z.object({ id: z.string().max(64), name: z.string().max(120), slug: z.string().max(80).default(""), unit: z.string().max(20), category: z.string().max(60).default("") }))
    .max(300)
    .default([]),
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

/** JSON schema the model must follow (kept flat and small for cheap models). */
export const AI_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...KINDS] },
          title: { type: "string", description: "Short name, e.g. 'Rice (1 kg)', 'Moto to town', 'Salary'. For bills the bill name." },
          amount: { type: ["integer", "null"], description: "Total money amount in the household currency, digits only. null if not said." },
          date: { type: ["string", "null"], description: "YYYY-MM-DD. For bills: the next due date." },
          category: { type: "string", enum: AI_CATEGORY_KEYS },
          merchant: { type: ["string", "null"], description: "Shop, market, person or company paid (or who paid, for income)." },
          paymentMethod: { type: ["string", "null"], enum: [...PAYMENT, null] },
          essential: { type: "boolean" },
          planned: { type: "boolean" },
          quantity: { type: ["number", "null"] },
          unit: { type: ["string", "null"], description: "kg, litre, piece, bag, tray, sack, bar..." },
          unitPrice: { type: ["integer", "null"], description: "Price per unit for shopping items and market prices." },
          marketName: { type: ["string", "null"] },
          productId: { type: ["string", "null"], description: "id from the product list if it clearly matches." },
          goalId: { type: ["string", "null"], description: "id from the savings goals if it clearly matches." },
          frequency: { type: ["string", "null"], enum: [...FREQ, null] },
          billKind: { type: ["string", "null"], enum: ["bill", "subscription", "loan", null] },
        },
        required: ["kind", "title", "amount", "date", "category"],
      },
    },
    questions: { type: "array", items: { type: "string", enum: [...AI_QUESTION_TOPICS] } },
    saveRequested: { type: "boolean" },
  },
  required: ["items", "questions"],
} as const;

const CATEGORY_HELP = AI_CATEGORY_KEYS.map((k) => {
  const c = SYSTEM_CATEGORIES.find((x) => x.id === CAT[k]);
  return `${k} = ${c?.name ?? k}`;
}).join("; ");

export function buildPrompt(req: AssistantRequest): string {
  const goals = req.goals.length ? req.goals.map((g) => `${g.id}: ${g.name}`).join("\n") : "(none)";
  const products = req.products.length ? req.products.slice(0, 120).map((p) => `${p.id}: ${p.name} (per ${p.unit})`).join("\n") : "(none)";
  return `You turn a household's message about money into records for the Trust Manager app (Rwanda, amounts in RWF).
The message may be English, Kinyarwanda or a mix, and may have spelling mistakes ("brought" usually means "bought", "to day" means "today", "frw"/"rwf" is the currency, "5k" = 5000, "ibihumbi bitanu" = 5000).

Today is ${req.today} (household time ${req.nowTime}). "Yesterday"/"ejo hashize" is the day before. "Ejo" alone usually means yesterday when talking about spending.

Return one item per separate thing:
- expense: money spent or paid. title = what was bought/paid (product name + quantity if given, e.g. "Rice (1 kg)").
- income: money received (salary, sales, gifts).
- savings: money put aside/saved ("save 20000 for land", "nabitse").
- shopping: something to buy LATER with no money spent yet ("buy 2 kg rice", "I need sugar"). Put the quantity, unit and unitPrice if a price is given; amount = null.
- price: a market price report ("sugar costs 1800 at Kimironko"). unitPrice = the price, marketName = the market; amount = null.
- bill: a repeating payment ("rent 150000 every month on the 5th"). date = next due date, frequency, billKind.
Never invent amounts: if a number is missing use null. Do not merge two purchases into one item.
A phrase like "put that in my database", "save it", "bibike" is NOT an item; set saveRequested = true.
If the person asks a question about their money (how much spent, balance, what's left, savings, bills due...), add the matching topic to "questions" and do not create items for it.

Categories (use the key): ${CATEGORY_HELP}.
Essential = needed for living (food, rent, transport, health, school, utilities); eating out, entertainment, clothes and gifts are not essential.
Payment: momo (mobile money / MTN / Airtel), bank, cash, card, or null if not said.

Savings goals:
${goals}

Products (match only if clearly the same thing):
${products}

Message:
"""${req.text}"""`;
}

/* --------------------------------------------------------------- normalize */

const itemSchema = z.object({
  kind: z.enum(KINDS),
  title: z.string().catch(""),
  amount: z.number().nullable().catch(null),
  date: z.string().nullable().catch(null),
  category: z.string().catch("other"),
  merchant: z.string().nullable().catch(null),
  paymentMethod: z.string().nullable().catch(null),
  essential: z.boolean().nullable().catch(null),
  planned: z.boolean().nullable().catch(null),
  quantity: z.number().nullable().catch(null),
  unit: z.string().nullable().catch(null),
  unitPrice: z.number().nullable().catch(null),
  marketName: z.string().nullable().catch(null),
  productId: z.string().nullable().catch(null),
  goalId: z.string().nullable().catch(null),
  frequency: z.string().nullable().catch(null),
  billKind: z.string().nullable().catch(null),
}).partial({ merchant: true, paymentMethod: true, essential: true, planned: true, quantity: true, unit: true, unitPrice: true, marketName: true, productId: true, goalId: true, frequency: true, billKind: true });

const outputSchema = z.object({
  items: z.array(z.unknown()).max(40).catch([]),
  questions: z.array(z.string()).catch([]),
  saveRequested: z.boolean().optional().catch(false),
});

const money = (n: number | null | undefined) => (n == null || !Number.isFinite(n) || n <= 0 ? null : Math.min(Math.round(n), 100_000_000_000));
const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const clip = (s: string | null | undefined, n: number) => (s ?? "").trim().replace(/\s+/g, " ").slice(0, n);
const NON_ESSENTIAL = new Set<string>([CAT.dining, CAT.entertainment, CAT.subscriptions, CAT.clothing, CAT.personal, CAT.gifts, CAT.other]);

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Turns a model's JSON into the app's drafts. Anything unusable is dropped;
 * ids are placeholders (the app assigns its own).
 */
export function normalizeAiOutput(raw: unknown, req: AssistantRequest): ParseResult {
  const out = outputSchema.safeParse(raw);
  if (!out.success) return { drafts: [], questions: [] };
  const drafts: Draft[] = [];
  const productById = new Map(req.products.map((p) => [p.id, p]));
  const goalById = new Map(req.goals.map((g) => [g.id, g]));
  const findProduct = (id: string | null | undefined, name: string) => {
    if (id && productById.has(id)) return productById.get(id)!;
    const n = name.toLowerCase();
    return req.products.find((p) => n && (p.name.toLowerCase() === n || (p.slug && n.includes(p.slug.replace(/-/g, " "))))) ?? null;
  };

  for (const rawItem of out.data.items) {
    const parsed = itemSchema.safeParse(rawItem);
    if (!parsed.success) continue;
    const it = parsed.data;
    const id = `ai-${drafts.length + 1}`;
    const date = isDate(it.date) ? it.date : req.today;
    const source = req.text.slice(0, 200);
    const title = clip(it.title, 80);

    if (it.kind === "expense" || it.kind === "income") {
      const amount = money(it.amount);
      const key = it.category as keyof typeof CAT;
      let categoryId: string = CAT[key] ?? (it.kind === "income" ? CAT.incomeOther : guessCategory(title));
      const cat = SYSTEM_CATEGORIES.find((c) => c.id === categoryId);
      // Keep income and expense categories on the right side.
      if (it.kind === "income" && cat?.kind !== "income") categoryId = CAT.incomeOther;
      if (it.kind === "expense" && (cat?.kind !== "expense" || categoryId === CAT.savings)) categoryId = guessCategory(title);
      const payment = PAYMENT.includes(it.paymentMethod as never) ? (it.paymentMethod as (typeof PAYMENT)[number]) : "cash";
      drafts.push({
        id, kind: "transaction", type: it.kind, source,
        missing: [...(amount == null ? ["amount"] : []), ...(title.length < 2 ? ["title"] : [])],
        include: true,
        title: title || (it.kind === "income" ? "Money received" : "Expense"),
        amount, date: date > addDays(req.today, 1) ? req.today : date, time: req.nowTime,
        categoryId, merchant: clip(it.merchant, 80),
        paymentMethod: payment,
        essential: it.kind === "income" ? true : it.essential ?? !NON_ESSENTIAL.has(categoryId),
        planned: it.planned ?? true,
      });
    } else if (it.kind === "savings") {
      const amount = money(it.amount);
      const goal = it.goalId ? goalById.get(it.goalId) ?? null : null;
      drafts.push({ id, kind: "savings", source, missing: amount == null ? ["amount"] : [], include: true, amount, goalId: goal?.id ?? null, goalName: goal?.name ?? null, date });
    } else if (it.kind === "shopping") {
      const p = findProduct(it.productId, title);
      const qty = it.quantity && it.quantity > 0 ? Math.min(it.quantity, 10_000) : 1;
      const unitPrice = money(it.unitPrice) ?? (money(it.amount) != null ? Math.round(money(it.amount)! / qty) : null);
      drafts.push({
        id, kind: "shopping", source, missing: unitPrice == null ? ["estimatedUnitPrice"] : [], include: true,
        productName: p?.name ?? (title || "Item"), marketProductId: p?.id ?? null, category: p?.category || "Other",
        quantity: qty, unit: clip(it.unit, 20) || p?.unit || "piece", estimatedUnitPrice: unitPrice, priority: "medium",
      });
    } else if (it.kind === "price") {
      const p = findProduct(it.productId, title);
      const price = money(it.unitPrice) ?? money(it.amount);
      const marketName = clip(it.marketName ?? it.merchant, 80);
      drafts.push({
        id, kind: "price", source,
        missing: [...(price == null ? ["price"] : []), ...(marketName.length < 2 ? ["marketName"] : [])],
        include: true, productName: p?.name ?? title, marketProductId: p?.id ?? null,
        unit: p?.unit ?? (clip(it.unit, 20) || "kg"), price, marketName, date: date > req.today ? req.today : date,
      });
    } else if (it.kind === "bill") {
      const amount = money(it.amount);
      const key = it.category as keyof typeof CAT;
      const catName = SYSTEM_CATEGORIES.find((c) => c.id === CAT[key] && c.kind === "expense")?.name ?? "Other";
      const freq = FREQ.includes(it.frequency as never) ? (it.frequency as (typeof FREQ)[number]) : "monthly";
      const billKind = it.billKind === "subscription" || it.billKind === "loan" ? it.billKind : "bill";
      drafts.push({
        id, kind: "bill", source, missing: amount == null ? ["amount"] : [], include: true,
        name: title || "Bill", amount, billKind, category: catName, frequency: freq,
        nextDueDate: isDate(it.date) && it.date >= req.today ? it.date : addDays(req.today, 30),
        essential: !NON_ESSENTIAL.has(CAT[key] ?? CAT.other),
      });
    }
  }

  const questions = out.data.questions.filter((q): q is QuestionTopic => (AI_QUESTION_TOPICS as readonly string[]).includes(q));
  return { drafts, questions: [...new Set(questions)], saveRequested: !!out.data.saveRequested };
}
