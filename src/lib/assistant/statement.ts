import { parseAmount, parseReceiptDate, parseReceiptText } from "@/lib/receipts/parse";
import { CAT } from "@/constants";
import type { Transaction } from "@/types";
import { guessCategory } from "./parse";
import type { ParseContext, TransactionDraft } from "./types";

/**
 * Turns bank / MoMo statement files into transaction drafts.
 *  - CSV with headers like Date, Description, Amount (or Debit/Credit,
 *    Withdrawal/Deposit, Money out/Money in). English or Kinyarwanda headers.
 *  - TXT exports of MoMo / bank SMS: each message is read with the receipt parser.
 * Nothing is saved here; drafts are confirmed by the person first.
 */

export const MAX_ROWS = 300;

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (ch === sep && !q) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const H = {
  date: /^(date|transaction date|value date|posting date|booking date|itariki|igihe|time|date\/time)$/i,
  desc: /^(description|details|narration|particulars|transaction details|memo|merchant|payee|ibisobanuro|icyo byakoreshejwe|to\/from|counterparty|name|from|to|reference description)$/i,
  amount: /^(amount|amount \(rwf\)|amount rwf|amafaranga|value|transaction amount)$/i,
  debit: /^(debit|debits|withdrawal|withdrawals|money out|out|paid out|dr|yasohotse|ibyasohotse)$/i,
  credit: /^(credit|credits|deposit|deposits|money in|in|paid in|cr|yinjiye|ibyinjiye)$/i,
  type: /^(type|transaction type|direction|dr\/cr|ubwoko)$/i,
  ref: /^(reference|ref|transaction id|txid|id|receipt no)$/i,
  balance: /^(balance|running balance|closing balance|asigaye)$/i,
};

function normDate(raw: string): string | null {
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return parseReceiptDate(s).date;
}

function normTime(raw: string): string {
  const m = /(\d{1,2}):(\d{2})/.exec(raw);
  return m ? `${m[1]!.padStart(2, "0")}:${m[2]}` : "12:00";
}

function money(raw: string | undefined): number | null {
  if (!raw) return null;
  const neg = /^\s*-|\(.*\)|\bdr\b/i.test(raw);
  const n = parseAmount(raw.replace(/[^\d.,\s]/g, "").trim());
  return n == null ? null : neg ? -n : n;
}

function isDuplicate(d: { amount: number; date: string; type: string }, existing: Transaction[], tzDate: (iso: string) => string) {
  return existing.find((t) => !t.deletedAt && t.amount === d.amount && t.type === d.type && tzDate(t.occurredAt) === d.date) ?? null;
}

export function parseCsvStatement(text: string, ctx: ParseContext, existing: Transaction[], tzDate: (iso: string) => string): TransactionDraft[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = [",", ";", "\t"].map((c) => ({ c, n: lines[0]!.split(c).length })).sort((a, b) => b.n - a.n)[0]!.c;
  // The header may not be on the first line (banks often add a title block).
  const headerIdx = lines.findIndex((l) => {
    const cells = splitCsvLine(l, sep);
    return cells.some((c) => H.date.test(c)) && cells.some((c) => H.amount.test(c) || H.debit.test(c) || H.credit.test(c));
  });
  if (headerIdx < 0) return [];
  const header = splitCsvLine(lines[headerIdx]!, sep);
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const iDate = col(H.date), iDesc = col(H.desc), iAmt = col(H.amount), iDr = col(H.debit), iCr = col(H.credit), iType = col(H.type), iRef = col(H.ref), iBal = col(H.balance);
  const drafts: TransactionDraft[] = [];
  for (const line of lines.slice(headerIdx + 1, headerIdx + 1 + MAX_ROWS)) {
    const c = splitCsvLine(line, sep);
    const date = iDate >= 0 ? normDate(c[iDate] ?? "") : null;
    if (!date) continue;
    let signed: number | null = null;
    if (iDr >= 0 || iCr >= 0) {
      const dr = money(c[iDr]);
      const cr = money(c[iCr]);
      if (dr && Math.abs(dr) > 0) signed = -Math.abs(dr);
      else if (cr && Math.abs(cr) > 0) signed = Math.abs(cr);
    }
    if (signed == null && iAmt >= 0) {
      signed = money(c[iAmt]);
      const typ = iType >= 0 ? (c[iType] ?? "").toLowerCase() : "";
      if (signed != null && /debit|dr|out|payment|withdraw|sent|paid/.test(typ)) signed = -Math.abs(signed);
      else if (signed != null && /credit|cr|in|deposit|received/.test(typ)) signed = Math.abs(signed);
    }
    if (!signed) continue;
    const description = (iDesc >= 0 ? c[iDesc] : "")?.trim() || "Statement entry";
    const type = signed < 0 ? "expense" : "income";
    const amount = Math.abs(signed);
    const dup = isDuplicate({ amount, date, type }, existing, tzDate);
    const categoryId = type === "income" ? (/salary|payroll|umushahara/i.test(description) ? CAT.salary : CAT.incomeOther) : guessCategory(description);
    drafts.push({
      id: ctx.newId(),
      kind: "transaction",
      type,
      source: line,
      missing: [],
      include: !dup,
      title: description.length > 60 ? `${description.slice(0, 57)}…` : description,
      amount,
      date,
      time: normTime(c[iDate] ?? ""),
      categoryId,
      merchant: description.slice(0, 80),
      paymentMethod: /momo|mobile money|mtn|airtel/i.test(text.slice(0, 400)) ? "momo" : "bank",
      essential: type === "income" || [CAT.groceries, CAT.rent, CAT.utilities, CAT.transport, CAT.health, CAT.education, CAT.communication, CAT.household, CAT.family].includes(categoryId as never),
      planned: true,
      reference: iRef >= 0 ? (c[iRef] || null) : null,
      recordedBalance: iBal >= 0 ? (money(c[iBal]) ?? null) : null,
      duplicateOf: dup?.id ?? null,
    });
  }
  return drafts;
}

/** TXT exports of SMS: split into messages and read each like a receipt. */
export function parseTextStatement(text: string, ctx: ParseContext, existing: Transaction[], tzDate: (iso: string) => string): TransactionDraft[] {
  const messages = text
    .replace(/\r/g, "")
    .split(/\n\s*\n|\n(?=\s*(?:TxId|TID|\*16[25]\*|You have|Your payment|Y'ello|\d{4}-\d{2}-\d{2}))/i)
    .map((m) => m.trim())
    .filter((m) => m.length > 15)
    .slice(0, MAX_ROWS);
  const drafts: TransactionDraft[] = [];
  for (const msg of messages) {
    const r = parseReceiptText(msg, 90);
    if (r.amount == null) continue;
    const date = r.localDate ?? ctx.today;
    const type = r.direction;
    const dup = isDuplicate({ amount: r.amount, date, type }, existing, tzDate);
    const merchant = r.merchant ?? "";
    drafts.push({
      id: ctx.newId(),
      kind: "transaction",
      type,
      source: msg.slice(0, 200),
      missing: [...(r.localDate ? [] : ["date"]), ...(merchant ? [] : ["merchant"])],
      include: !dup,
      title: merchant ? (type === "income" ? `From ${merchant}` : `Payment to ${merchant}`) : type === "income" ? "Money received" : "Payment",
      amount: r.amount,
      date,
      time: r.localTime ?? "12:00",
      categoryId: type === "income" ? CAT.incomeOther : guessCategory(merchant),
      merchant,
      paymentMethod: (r.paymentMethod as TransactionDraft["paymentMethod"]) ?? "momo",
      essential: true,
      planned: true,
      reference: r.transactionReference,
      recordedBalance: r.remainingBalance,
      duplicateOf: dup?.id ?? null,
    });
  }
  return drafts;
}
