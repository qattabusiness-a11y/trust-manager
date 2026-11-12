import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { CAT } from "@/constants";
import { assistantRequestSchema, buildPrompt, normalizeAiOutput } from "../ai";
import { extractJson, geminiJson } from "@/server/assistant/gemini";
import type { BillDraft, PriceDraft, SavingsDraft, ShoppingDraft, TransactionDraft } from "../types";

const req = assistantRequestSchema.parse({
  text: "to day ihave purchased 1kg of rice for 1500 frw and beans for 300 frw put that data into my data base",
  language: "en",
  today: "2026-11-12",
  nowTime: "19:30",
  goals: [{ id: "g1", name: "Plot of land" }],
  products: [{ id: "p-rice", name: "Rice (local)", slug: "rice", unit: "kg", category: "Grains" }],
});

describe("normalizeAiOutput", () => {
  it("turns model items into the app's drafts", () => {
    const r = normalizeAiOutput(
      {
        items: [
          { kind: "expense", title: "Rice (1 kg)", amount: 1500, date: "2026-11-12", category: "groceries", paymentMethod: null, essential: true, planned: true },
          { kind: "expense", title: "Beans", amount: 300, date: null, category: "groceries" },
          { kind: "income", title: "Salary", amount: 480000, date: "2026-11-12", category: "salary", paymentMethod: "bank" },
          { kind: "savings", title: "Land", amount: 20000, date: null, category: "savings", goalId: "g1" },
          { kind: "shopping", title: "Rice", amount: null, date: null, category: "groceries", quantity: 2, unit: "kg", unitPrice: null },
          { kind: "price", title: "Sugar", amount: null, date: null, category: "groceries", unitPrice: 1800, marketName: "Kimironko Market" },
          { kind: "bill", title: "House rent", amount: 150000, date: "2026-12-05", category: "rent", frequency: "monthly", billKind: "bill" },
        ],
        questions: ["spent_week", "made_up_topic"],
        saveRequested: true,
      },
      req,
    );
    expect(r.saveRequested).toBe(true);
    expect(r.questions).toEqual(["spent_week"]);
    const [rice, beans, salary, sav, shop, price, bill] = r.drafts as [TransactionDraft, TransactionDraft, TransactionDraft, SavingsDraft, ShoppingDraft, PriceDraft, BillDraft];
    expect([rice.title, rice.amount, rice.categoryId, rice.date, rice.time, rice.paymentMethod]).toEqual(["Rice (1 kg)", 1500, CAT.groceries, "2026-11-12", "19:30", "cash"]);
    expect([beans.amount, beans.date, beans.missing]).toEqual([300, "2026-11-12", []]);
    expect([salary.type, salary.categoryId, salary.paymentMethod]).toEqual(["income", CAT.salary, "bank"]);
    expect([sav.amount, sav.goalId, sav.goalName]).toEqual([20000, "g1", "Plot of land"]);
    expect([shop.productName, shop.marketProductId, shop.quantity, shop.missing]).toEqual(["Rice (local)", "p-rice", 2, ["estimatedUnitPrice"]]);
    expect([price.price, price.marketName]).toEqual([1800, "Kimironko Market"]);
    expect([bill.name, bill.category, bill.nextDueDate, bill.frequency]).toEqual(["House rent", "Rent & Housing", "2026-12-05", "monthly"]);
  });

  it("drops junk and never trusts made-up values", () => {
    const r = normalizeAiOutput(
      {
        items: [
          { kind: "expense", title: "Lunch", amount: -50, date: "2099-01-01", category: "salary" },
          { kind: "teleport", title: "x" },
          "not an object",
          { kind: "savings", title: "x", amount: 5000, date: null, category: "savings", goalId: "unknown-goal" },
        ],
        questions: [],
      },
      req,
    );
    expect(r.drafts).toHaveLength(2);
    const lunch = r.drafts[0] as TransactionDraft;
    expect(lunch.amount).toBeNull(); // negative amount refused
    expect(lunch.missing).toContain("amount");
    expect(lunch.date).toBe("2026-11-12"); // far-future date refused
    expect(lunch.categoryId).not.toBe(CAT.salary); // income category refused for an expense
    expect((r.drafts[1] as SavingsDraft).goalId).toBeNull(); // unknown goal id refused
    expect(normalizeAiOutput("nonsense", req)).toEqual({ drafts: [], questions: [] });
  });

  it("only sends names and the message to the model", () => {
    const p = buildPrompt(req);
    expect(p).toContain("2026-11-12");
    expect(p).toContain("Plot of land");
    expect(p).toContain(req.text);
  });
});

describe("geminiJson", () => {
  const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

  it("calls Gemini with the key in a header and reads the JSON answer", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ok('```json\n{"items":[],"questions":["balance"]}\n```'));
    const out = await geminiJson("hi", { type: "object" }, { apiKey: "test-key", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ items: [], questions: ["balance"] });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent");
    expect((init!.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    expect(String(url)).not.toContain("test-key");
  });

  it("retries with a simpler request when Google rejects the format", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => (++n < 3 ? new Response('{"error":{"message":"Invalid JSON payload received. Unknown name"}}', { status: 400 }) : ok('{"items":[],"questions":[]}')));
    await expect(geminiJson("hi", {}, { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toEqual({ items: [], questions: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry on quota errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("quota", { status: 429 }));
    await expect(geminiJson("hi", {}, { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toMatchObject({ status: 429 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports a bad key clearly", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":{"message":"API key not valid. Please pass a valid API key."}}', { status: 400 }));
    await expect(geminiJson("hi", {}, { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toMatchObject({ status: 401 });
  });

  it("extracts JSON surrounded by text", () => {
    expect(extractJson('Here you go: {"a":1} thanks')).toEqual({ a: 1 });
  });
});
