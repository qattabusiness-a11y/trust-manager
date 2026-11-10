import type { ReceiptExtraction } from "@/types";

/**
 * Turns the raw text read from a receipt (MoMo SMS screenshot, Airtel Money,
 * bank transfer confirmation, shop invoice) into structured fields.
 * Pure and deterministic so it can be unit-tested; nothing here guesses a
 * value that is not present in the text — missing fields stay null and the
 * user fills them in on the confirmation form.
 */

const CUR = "(?:RWF|FRW|Rwf|Frw|rwf|frw)";
const NUM = "(\\d{1,3}(?:[ ,.]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)";
/** "23,450 RWF" or "RWF 23,450" — captures the number in group 1 or 2. */
const MONEY = `(?:${NUM}\\s*${CUR}|${CUR}\\s*:?\\s*${NUM})`;

export function parseAmount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(/\s/g, "");
  // Trailing decimals (".00" / ",50") are dropped: RWF has no minor unit.
  s = s.replace(/[.,]\d{1,2}$/, "");
  s = s.replace(/[.,]/g, "");
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

function money(text: string, before: string, after = ""): number | null {
  const m = new RegExp(`${before}\\s*${MONEY}${after}`, "i").exec(text);
  return m ? parseAmount(m[1] ?? m[2]) : null;
}

/** Fix the most common OCR confusions inside money and keywords. */
export function normalizeReceiptText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[|]/g, "I")
    .replace(/\bR[VW]{1,2}F\b/gi, "RWF")
    .replace(/\bRWE\b/g, "RWF")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

export function parseReceiptDate(text: string): { date: string | null; time: string | null } {
  let date: string | null = null;
  let time: string | null = null;
  let rest = text;
  let m = /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (m) {
    date = `${m[1]}-${pad(+m[2]!)}-${pad(+m[3]!)}`;
    rest = text.slice(m.index + m[0].length);
  } else if ((m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/.exec(text))) {
    // Day first, as written in Rwanda.
    date = `${m[3]}-${pad(+m[2]!)}-${pad(+m[1]!)}`;
    rest = text.slice(m.index + m[0].length);
  } else if ((m = /\b(\d{1,2})(?:st|nd|rd|th)?[ -]([A-Za-z]{3})[a-z]*\.?,?[ -](20\d{2})\b/.exec(text)) && MONTHS[m[2]!.toLowerCase()]) {
    date = `${m[3]}-${pad(MONTHS[m[2]!.toLowerCase()]!)}-${pad(+m[1]!)}`;
    rest = text.slice(m.index + m[0].length);
  } else if ((m = /\b([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (20\d{2})\b/.exec(text)) && MONTHS[m[1]!.toLowerCase()]) {
    date = `${m[3]}-${pad(MONTHS[m[1]!.toLowerCase()]!)}-${pad(+m[2]!)}`;
    rest = text.slice(m.index + m[0].length);
  }
  if (date) {
    const [, mo, d] = date.split("-").map(Number);
    if (mo! < 1 || mo! > 12 || d! < 1 || d! > 31) date = null;
  }
  const t = /^\D{0,6}(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i.exec(rest) ?? /\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i.exec(text);
  if (t) {
    let h = +t[1]!;
    const ap = t[3]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h <= 23 && +t[2]! <= 59) time = `${pad(h)}:${t[2]}`;
  }
  return { date, time };
}

function cleanName(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw
    .replace(/\(\s*[\d*+ ]{5,}\s*\)/g, " ") // (2507…) phone numbers
    .replace(/\b\d{5,}\b/g, " ") // merchant codes
    .replace(/[^\p{L}\p{N}&'’.\- ]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s.\-]+$/, "")
    .trim();
  if (s.length < 2 || /^\d+$/.test(s)) return null;
  return s.length > 60 ? s.slice(0, 60).trim() : s;
}

const STOP = "(?=\\s+(?:has been|was |is |from |at |on |with |for |via |ref|txid|fee|\\d{4}-)|\\s*[.(,;:\\n]|$)";

function findMerchant(text: string, flat: string, incoming: boolean): string | null {
  const labelled = /(?:^|\n)\s*(?:beneficiary(?: name)?|merchant|payee|recipient|receiver|paid to|sent to|to)\s*[:\-]\s*([^\n]+)/i.exec(text);
  const patterns = incoming
    ? [new RegExp(`received\\s+${MONEY}\\s+from\\s+(.+?)${STOP}`, "i"), new RegExp(`from\\s*[:\\-]?\\s*([A-Za-z].+?)${STOP}`, "i")]
    : [
        new RegExp(`(?:payment of|paid|sent|transferred)\\s+${MONEY}\\s+to\\s+(.+?)${STOP}`, "i"),
        new RegExp(`${MONEY}\\s+(?:transferred|sent|paid)\\s+to\\s+(.+?)${STOP}`, "i"),
        new RegExp(`(?:payment|transfer|paid|sent)\\s+to\\s+([A-Za-z].+?)${STOP}`, "i"),
      ];
  for (const p of patterns) {
    const m = p.exec(flat);
    const name = cleanName(m?.[m.length - 1]);
    if (name) return name;
  }
  const fromLabel = cleanName(labelled?.[1]);
  if (fromLabel) return fromLabel;
  // Shop invoices: the first line is usually the shop name.
  const first = text.split("\n").map((l) => l.trim()).find((l) => /[A-Za-z]{3,}/.test(l) && !/receipt|invoice|tax|tin|tel|date|momo|mobile money|transaction|successful|details/i.test(l));
  return first && first.length <= 40 && !new RegExp(CUR).test(first) ? cleanName(first) : null;
}

export interface ParsedReceipt extends ReceiptExtraction {
  /** Calendar date and wall-clock time exactly as printed on the receipt. */
  localDate: string | null;
  localTime: string | null;
  direction: "expense" | "income";
  fee: number | null;
  fieldsFound: number;
}

export function parseReceiptText(rawText: string, ocrConfidence = 100): ParsedReceipt {
  const lines = normalizeReceiptText(rawText);
  // Sentences in SMS-style receipts wrap across lines, so sentence patterns
  // run on a flattened copy; label/first-line detection uses the line layout.
  const text = lines.replace(/\n/g, " ").replace(/ {2,}/g, " ");
  const incoming = /\b(?:you have received|received\s+(?:rwf|frw|\d)|has sent you|credited|deposit(?:ed)? of)\b/i.test(text) && !/\b(?:payment of|you have paid|transferred to|sent to)\b/i.test(text);

  const balance = money(text, "(?:new |available |your new |current )?bal(?:ance)?\\.?\\s*(?:is|was|:|-)?") ?? null;
  const fee = money(text, "(?:fee|charge|charges|frais)s?\\s*(?:was|is|:|-)?\\s*:?");

  let amount =
    money(text, "payment of") ??
    money(text, "(?:you have |you )?(?:paid|sent|transferred|withdrawn|received)") ??
    (() => {
      const m = new RegExp(`${MONEY}\\s+(?:transferred|sent|paid|received|has been)`, "i").exec(text);
      return m ? parseAmount(m[1] ?? m[2]) : null;
    })() ??
    money(text, "(?:grand |net )?total(?: amount| due| paid)?\\s*[:\\-]?") ??
    money(text, "amount(?: paid| sent| due)?\\s*[:\\-]?");

  if (amount == null) {
    // Fallback: the largest amount that is neither the balance nor the fee.
    const all = [...text.matchAll(new RegExp(MONEY, "gi"))].map((m) => parseAmount(m[1] ?? m[2])).filter((n): n is number => n != null && n > 0);
    const candidates = all.filter((n) => n !== balance && n !== fee);
    amount = candidates.length ? Math.max(...candidates) : null;
  }
  if (amount === 0) amount = null;

  const { date, time } = parseReceiptDate(text);
  const ref = /(?:tx\s*[il1]d|txn\s*[il1]d|t[il1]d|transaction\s*(?:id|ref(?:erence)?|no\.?|number)|financial transaction id|ref(?:erence)?(?:\s*(?:no|number|id))?\.?|receipt\s*(?:no|number)\.?)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9.\-/]{4,})/i.exec(text);
  const reference = ref?.[1]?.replace(/[.\-/]+$/, "") ?? null;

  const paymentMethod = /\bmomo\b|mobile money|\*16[25]\*|\*182\*|\bmtn\b|airtel|tigo|txid/i.test(text)
    ? "momo"
    : /\bvisa\b|mastercard|\bcard\b|\bpos\b/i.test(text)
      ? "card"
      : /\bbank\b|\bBK\b|equity|i&m|cogebanque|ecobank|\bkcb\b|\bbpr\b|account (?:no|number)|swift|\bFT\d{5}/i.test(text)
        ? "bank"
        : /\bcash\b/i.test(text)
          ? "cash"
          : null;

  const merchant = findMerchant(lines, text, incoming);
  const found = [amount != null, !!merchant, !!date, !!reference].filter(Boolean).length;
  const fieldScore = (amount != null ? 0.5 : 0) + (merchant ? 0.2 : 0) + (date ? 0.2 : 0) + (reference ? 0.1 : 0);
  const confidence = Math.round((0.45 * Math.max(0, Math.min(1, ocrConfidence / 100)) + 0.55 * fieldScore) * 100) / 100;

  return {
    amount,
    remainingBalance: balance,
    merchant,
    transactionDate: date ? `${date}T${time ?? "12:00"}` : null,
    transactionReference: reference,
    paymentMethod,
    confidence,
    localDate: date,
    localTime: time,
    direction: incoming ? "income" : "expense",
    fee: fee && fee > 0 ? fee : null,
    fieldsFound: found,
  };
}

/** Magic-byte check so a renamed file can't pass as an image. */
export function sniffImageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
