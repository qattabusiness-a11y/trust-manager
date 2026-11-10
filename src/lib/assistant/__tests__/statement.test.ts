import { describe, expect, it } from "vitest";
import { CAT } from "@/constants";
import { parseCsvStatement, parseTextStatement } from "../statement";
import type { ParseContext } from "../types";

let n = 0;
const ctx: ParseContext = { today: "2026-11-10", nowTime: "14:00", goals: [], products: [], newId: () => `s${++n}` };
const tzDate = (iso: string) => iso.slice(0, 10);

describe("statement files", () => {
  it("reads a bank CSV with debit/credit columns and a title block", () => {
    const csv = `Bank of Kigali,Statement\nAccount,0001\n\nDate,Description,Debit,Credit,Balance\n2026-11-01,SALARY ISANGE ACCOUNTING,,650000,700000\n2026-11-02,"SIMBA SUPERMARKET, KIGALI",23450,,676550\n2026-11-03,REG CASH POWER,15000,,661550`;
    const d = parseCsvStatement(csv, ctx, [], tzDate);
    expect(d.map((x) => [x.type, x.amount, x.date, x.categoryId])).toEqual([
      ["income", 650000, "2026-11-01", CAT.salary],
      ["expense", 23450, "2026-11-02", CAT.groceries],
      ["expense", 15000, "2026-11-03", CAT.utilities],
    ]);
    expect(d[1]!.merchant).toBe("SIMBA SUPERMARKET, KIGALI");
    expect(d[2]!.recordedBalance).toBe(661550);
  });
  it("reads a signed-amount CSV with semicolons and day-first dates", () => {
    const csv = `Itariki;Ibisobanuro;Amafaranga\n05/11/2026;Moto Yego;-2000\n06/11/2026;Client payment;45000`;
    const d = parseCsvStatement(csv, ctx, [], tzDate);
    expect(d.map((x) => [x.type, x.amount, x.date])).toEqual([["expense", 2000, "2026-11-05"], ["income", 45000, "2026-11-06"]]);
  });
  it("unticks likely duplicates of transactions already recorded", () => {
    const csv = `Date,Description,Amount\n2026-11-02,Simba,-23450\n2026-11-04,Pharmacy,-9500`;
    const existing = [{ id: "t1", amount: 23450, type: "expense", occurredAt: "2026-11-02T10:00:00Z", deletedAt: null }] as never;
    const d = parseCsvStatement(csv, ctx, existing, tzDate);
    expect(d.map((x) => [x.include, x.duplicateOf])).toEqual([[false, "t1"], [true, null]]);
  });
  it("returns nothing for a file without the needed columns", () => {
    expect(parseCsvStatement("name,age\nkeza,20", ctx, [], tzDate)).toEqual([]);
  });
  it("reads exported MoMo SMS messages", () => {
    const txt = `TxId: 111222333. Your payment of 5,000 RWF to KIMIRONKO SHOP has been completed at 2026-11-08 09:10:00. Your new balance: 80,000 RWF.\n\nYou have received 20000 RWF from Marie Claire (*********123) at 2026-11-08 17:05:44. Your new balance:100000 RWF.`;
    const d = parseTextStatement(txt, ctx, [], tzDate);
    expect(d.map((x) => [x.type, x.amount, x.merchant, x.date])).toEqual([["expense", 5000, "KIMIRONKO SHOP", "2026-11-08"], ["income", 20000, "Marie Claire", "2026-11-08"]]);
  });
});
