import { describe, expect, it } from "vitest";
import { parseAmount, parseReceiptDate, parseReceiptText, sniffImageType } from "../parse";

describe("receipt parser", () => {
  it("reads an MTN MoMo merchant payment", () => {
    const r = parseReceiptText("TxId: 13579246810. Your payment of 23,450 RWF to SIMBA SUPERMARKET 51234 has been completed at 2026-11-10 14:32:10. Your new balance: 210,000 RWF. Fee was 0 RWF.");
    expect(r).toMatchObject({ amount: 23450, remainingBalance: 210000, merchant: "SIMBA SUPERMARKET", localDate: "2026-11-10", localTime: "14:32", transactionReference: "13579246810", paymentMethod: "momo", direction: "expense", fee: null });
    expect(r.confidence).toBeGreaterThan(0.9);
  });
  it("handles sentences wrapped across lines, as in a phone screenshot", () => {
    const r = parseReceiptText("M-Money\nTxId: 13579246810. Your payment\nof 23,450 RWF to SIMBA\nSUPERMARKET 51234 has been\ncompleted at 2026-11-09 14:32:10.\nYour new balance: 210,000 RWF.\nFee was 0 RWF.");
    expect(r).toMatchObject({ amount: 23450, merchant: "SIMBA SUPERMARKET", remainingBalance: 210000, localDate: "2026-11-09", localTime: "14:32", transactionReference: "13579246810" });
  });
  it("reads a MoMo person-to-person transfer with a fee", () => {
    const r = parseReceiptText("*165*S*5000 RWF transferred to Jean Bosco (250788123456) from 36521838 at 2026-11-09 08:11:02 . Fee was: 100 RWF. New balance: 45000 RWF.");
    expect(r).toMatchObject({ amount: 5000, merchant: "Jean Bosco", fee: 100, remainingBalance: 45000, localDate: "2026-11-09", localTime: "08:11", paymentMethod: "momo" });
  });
  it("recognises money received as income", () => {
    const r = parseReceiptText("You have received 20000 RWF from Marie Claire (*********123) on your mobile money account at 2026-11-08 17:05:44. Your new balance:65000 RWF. Financial Transaction Id: 9988776655.");
    expect(r).toMatchObject({ amount: 20000, direction: "income", merchant: "Marie Claire", remainingBalance: 65000, transactionReference: "9988776655" });
  });
  it("reads an Airtel Money style message with the currency first", () => {
    const r = parseReceiptText("TID: MP261110.1432.A12345. You have paid RWF 5,000 to KIMIRONKO SHOP. Bal: RWF 12,000.");
    expect(r).toMatchObject({ amount: 5000, merchant: "KIMIRONKO SHOP", remainingBalance: 12000, transactionReference: "MP261110.1432.A12345" });
  });
  it("reads a bank transfer confirmation laid out as labels", () => {
    const r = parseReceiptText("Bank of Kigali\nTransfer successful\nAmount: RWF 200,000.00\nBeneficiary: HABIMANA Jean\nDate: 01/11/2026 09:15\nReference: FT26305ABCD");
    expect(r).toMatchObject({ amount: 200000, merchant: "HABIMANA Jean", localDate: "2026-11-01", localTime: "09:15", transactionReference: "FT26305ABCD", paymentMethod: "bank" });
  });
  it("reads a shop invoice total", () => {
    const r = parseReceiptText("SAWA CITI\nTIN 102345678\nRice 5kg 6,500\nOil 3,100\nTOTAL: 9,600 RWF\n10 Nov 2026 18:40\nCash");
    expect(r).toMatchObject({ amount: 9600, merchant: "SAWA CITI", localDate: "2026-11-10", localTime: "18:40", paymentMethod: "cash" });
  });
  it("never invents values that are not in the text", () => {
    const r = parseReceiptText("hello world, nothing useful here");
    expect(r).toMatchObject({ amount: null, remainingBalance: null, localDate: null, transactionReference: null });
    expect(r.confidence).toBeLessThan(0.6);
  });
  it("does not mistake the balance for the amount", () => {
    const r = parseReceiptText("Payment to REG Cash Power completed. Fee was 0 RWF. New balance: 88,000 RWF. Amount 15,000 RWF");
    expect(r.amount).toBe(15000);
    expect(r.remainingBalance).toBe(88000);
  });
  it("parses amounts and dates in common formats", () => {
    expect(parseAmount("1,250,000")).toBe(1250000);
    expect(parseAmount("23 450")).toBe(23450);
    expect(parseAmount("200,000.00")).toBe(200000);
    expect(parseAmount("abc")).toBeNull();
    expect(parseReceiptDate("on 3 November 2026 at 7:05 PM")).toEqual({ date: "2026-11-03", time: "19:05" });
    expect(parseReceiptDate("Nov 3, 2026")).toEqual({ date: "2026-11-03", time: null });
  });
  it("validates image bytes", () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]))).toBe("image/png");
    expect(sniffImageType(new TextEncoder().encode("not an image"))).toBeNull();
  });
});
