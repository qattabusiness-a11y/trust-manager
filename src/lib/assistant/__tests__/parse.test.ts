import { describe, expect, it } from "vitest";
import { CAT } from "@/constants";
import { findAmounts, findDate, parseMessage } from "../parse";
import type { ParseContext, TransactionDraft, ShoppingDraft, PriceDraft, BillDraft, SavingsDraft } from "../types";

let n = 0;
const ctx: ParseContext = {
  today: "2026-11-10", // Tuesday
  nowTime: "14:00",
  goals: [{ id: "g1", name: "Emergency fund — 3 months" }, { id: "g2", name: "Laptop" }],
  products: [
    { id: "p-rice", slug: "rice", name: "Rice (local)", unit: "kg", category: "Grains" },
    { id: "p-oil", slug: "cooking-oil", name: "Cooking oil", unit: "litre", category: "Cooking oil" },
    { id: "p-beans", slug: "beans", name: "Beans", unit: "kg", category: "Grains" },
  ],
  newId: () => `d${++n}`,
};
const tx = (text: string) => parseMessage(text, ctx).drafts as TransactionDraft[];

describe("amounts", () => {
  it("reads common formats", () => {
    expect(findAmounts("spent 5,000 rwf").map((a) => a.value)).toEqual([5000]);
    expect(findAmounts("frw 12 500 on food").map((a) => a.value)).toEqual([12500]);
    expect(findAmounts("got 250k").map((a) => a.value)).toEqual([250000]);
    expect(findAmounts("1.5m salary").map((a) => a.value)).toEqual([1500000]);
    expect(findAmounts("ibihumbi bitanu").map((a) => a.value)).toEqual([5000]);
    expect(findAmounts("ibihumbi 20").map((a) => a.value)).toEqual([20000]);
  });
  it("ignores quantities, times and small counts", () => {
    expect(findAmounts("bought 10kg rice for 13000").map((a) => a.value)).toEqual([13000]);
    expect(findAmounts("at 3:30 pm paid 2000").map((a) => a.value)).toEqual([2000]);
    expect(findAmounts("2 moto rides")).toEqual([]);
  });
});

describe("dates", () => {
  it("understands relative days in both languages", () => {
    expect(findDate("today", ctx.today)).toBe("2026-11-10");
    expect(findDate("yesterday", ctx.today)).toBe("2026-11-09");
    expect(findDate("ejo hashize", ctx.today)).toBe("2026-11-09");
    expect(findDate("uyu munsi", ctx.today)).toBe("2026-11-10");
    expect(findDate("on friday", ctx.today)).toBe("2026-11-06");
    expect(findDate("kuwa mbere", ctx.today)).toBe("2026-11-09");
    expect(findDate("on 3 nov", ctx.today)).toBe("2026-11-03");
  });
});

describe("expenses and income", () => {
  it("splits one sentence into several expenses with categories", () => {
    const d = tx("I spent 2,000 on moto and 6,500 on lunch today");
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ type: "expense", amount: 2000, categoryId: CAT.transport, date: "2026-11-10", essential: true });
    expect(d[1]).toMatchObject({ type: "expense", amount: 6500, categoryId: CAT.dining, essential: false });
  });
  it("reads payee and payment method", () => {
    const [d] = tx("Paid 15,000 for groceries at Simba with cash yesterday");
    expect(d).toMatchObject({ amount: 15000, categoryId: CAT.groceries, merchant: "Simba", paymentMethod: "cash", date: "2026-11-09" });
  });
  it("understands Kinyarwanda expenses", () => {
    const [d] = tx("Naguze umuceri wa 13000 i Kimironko ejo hashize");
    expect(d).toMatchObject({ type: "expense", amount: 13000, categoryId: CAT.groceries, merchant: "Kimironko", date: "2026-11-09" });
  });
  it("understands income in both languages", () => {
    expect(tx("Received 250,000 salary from Isange Accounting")[0]).toMatchObject({ type: "income", amount: 250000, categoryId: CAT.salary, merchant: "Isange Accounting" });
    expect(tx("Nahembwe 250,000 uyu munsi")[0]).toMatchObject({ type: "income", amount: 250000, categoryId: CAT.salary });
    expect(tx("Sold vegetables for 30000")[0]).toMatchObject({ type: "income", amount: 30000, categoryId: CAT.business });
  });
  it("carries the verb and date to the next clause", () => {
    const d = tx("Yesterday I paid 8,200 for water. 25000 internet");
    expect(d.map((x) => [x.amount, x.categoryId, x.date])).toEqual([[8200, CAT.utilities, "2026-11-09"], [25000, CAT.communication, "2026-11-09"]]);
  });
  it("never invents an amount", () => {
    const d = tx("I paid the electricity bill");
    expect(d[0]).toMatchObject({ amount: null, missing: ["amount"], categoryId: CAT.utilities });
  });
});

describe("savings, shopping, prices, bills, questions", () => {
  it("records savings to a matching goal", () => {
    const [d] = parseMessage("Saved 20,000 for the laptop", ctx).drafts as SavingsDraft[];
    expect(d).toMatchObject({ kind: "savings", amount: 20000, goalId: "g2" });
    const [e] = parseMessage("Nazigamye 10000 mu bwizigame bw'ingoboka", ctx).drafts as SavingsDraft[];
    expect(e).toMatchObject({ kind: "savings", amount: 10000, goalId: "g1" });
  });
  it("builds shopping items with quantities", () => {
    const d = parseMessage("Need to buy 10kg rice, 3 litres of oil and soap", ctx).drafts as ShoppingDraft[];
    expect(d.map((x) => [x.productName, x.quantity, x.unit, x.marketProductId])).toEqual([["Rice", 10, "kg", "p-rice"], ["Cooking oil", 3, "litre", "p-oil"], ["Soap", 1, "piece", null]]);
    const r = parseMessage("Nkeneye kugura ibishyimbo 5kg", ctx).drafts as ShoppingDraft[];
    expect(r[0]).toMatchObject({ productName: "Beans", quantity: 5, unit: "kg" });
  });
  it("records market prices", () => {
    const [d] = parseMessage("Rice costs 1,300 per kg at Kimironko", ctx).drafts as PriceDraft[];
    expect(d).toMatchObject({ kind: "price", marketProductId: "p-rice", price: 1300, unit: "kg", marketName: "Kimironko" });
  });
  it("creates recurring bills with the next due date", () => {
    const [d] = parseMessage("Rent is 200,000 every month due on the 5th", ctx).drafts as BillDraft[];
    expect(d).toMatchObject({ kind: "bill", amount: 200000, frequency: "monthly", nextDueDate: "2026-12-05", category: "Rent & Housing", billKind: "bill" });
    const [s] = parseMessage("Netflix subscription 12000 monthly", ctx).drafts as BillDraft[];
    expect(s).toMatchObject({ billKind: "subscription", amount: 12000 });
  });
  it("answers questions instead of recording", () => {
    expect(parseMessage("How much did I spend this week?", ctx)).toEqual({ drafts: [], questions: ["spent_week"], saveRequested: false });
    expect(parseMessage("Nasigaranye angahe?", ctx).questions).toEqual(["budget_left"]);
    expect(parseMessage("When will my money run out?", ctx).questions).toEqual(["run_out"]);
    expect(parseMessage("muraho", ctx).questions).toEqual(["help"]);
  });
});

describe("shopping reminders", () => {
  it("treats 'Buy 2 kg rice' without a price as a shopping item", async () => {
    const { parseMessage } = await import("../parse");
    const r = parseMessage("Buy 2 kg rice", { today: "2026-11-10", nowTime: "12:00", goals: [], products: [], newId: (() => { let i = 0; return () => `id${++i}`; })() });
    expect(r.drafts.map((d) => d.kind)).toEqual(["shopping"]);
  });
});

describe("Kinyarwanda lists", () => {
  it("names each item in 'amata 1500 n'umugati 1000'", () => {
    let i = 0;
    const r = parseMessage("Ejo naguze amata 1500 n'umugati 1000", { today: "2026-11-10", nowTime: "12:00", goals: [], products: [], newId: () => `k${++i}` });
    const t = r.drafts as TransactionDraft[];
    expect(t.map((d) => [d.amount, d.date])).toEqual([[1500, "2026-11-09"], [1000, "2026-11-09"]]);
    expect(t[0]!.title.toLowerCase()).toContain("amata");
    expect(t[1]!.title.toLowerCase()).toContain("umugati");
  });
});

describe("direct save requests", () => {
  const ctx = () => { let i = 0; return { today: "2026-11-10", nowTime: "12:00", goals: [], products: [], newId: () => `s${++i}` }; };
  it("reads the sentence and notices the save command", () => {
    const r = parseMessage("to day ihave purchased or brought 1kg of rice for 1500 frw and beans for 300 frw put that data into my data base", ctx());
    expect(r.saveRequested).toBe(true);
    const t = r.drafts as TransactionDraft[];
    expect(t.map((d) => [d.title, d.amount, d.date, d.categoryId])).toEqual([
      ["Rice (1 kg)", 1500, "2026-11-10", CAT.groceries],
      ["Beans", 300, "2026-11-10", CAT.groceries],
    ]);
  });
  it("understands Kinyarwanda 'bibike'", () => {
    const r = parseMessage("Naguze isukari 2000, bibike", ctx());
    expect(r.saveRequested).toBe(true);
    expect((r.drafts[0] as TransactionDraft).amount).toBe(2000);
  });
  it("doesn't treat 'save 20000 for land' as a save command", () => {
    const r = parseMessage("Save 20000 for land", ctx());
    expect(r.saveRequested).toBe(false);
    expect(r.drafts[0]!.kind).toBe("savings");
  });
});

describe("about the app", () => {
  it.each(["who developed you?", "Who made Trust Manager", "ninde wagukoze?", "who is the developer"])("%s → about", (m) => {
    let i = 0;
    const r = parseMessage(m, { today: "2026-11-12", nowTime: "12:00", goals: [], products: [], newId: () => `a${++i}` });
    expect(r.questions).toEqual(["about"]);
    expect(r.drafts).toEqual([]);
  });
});
