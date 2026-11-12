import { addDays, addMonths, format, getDay, parseISO, setDate } from "date-fns";
import { CAT } from "@/constants";
import { parseReceiptDate } from "@/lib/receipts/parse";
import type { PaymentMethod, RecurringFrequency } from "@/types";
import type { BillDraft, Draft, ParseContext, ParseResult, PriceDraft, QuestionTopic, SavingsDraft, ShoppingDraft, TransactionDraft } from "./types";

/**
 * Rule-based understanding of everyday money messages in English and
 * Kinyarwanda. Deterministic and offline. It never invents an amount: if a
 * number isn't in the message, the draft is marked as missing it and the
 * person fills it in before saving.
 */

/* ----------------------------------------------------------------- text */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text: string, words: string[]) => words.some((w) => new RegExp(`(^|[^a-z])${esc(w)}([^a-z]|$)`, "i").test(text));

/* --------------------------------------------------------------- amounts */

const RW_NUMBERS: Record<string, number> = {
  rimwe: 1, kimwe: 1, imwe: 1, kamwe: 1,
  kabiri: 2, bibiri: 2, ebyiri: 2, abiri: 2,
  gatatu: 3, bitatu: 3, eshatu: 3, atatu: 3,
  kane: 4, bine: 4, enye: 4, ane: 4,
  gatanu: 5, bitanu: 5, eshanu: 5, atanu: 5,
  gatandatu: 6, bitandatu: 6, esheshatu: 6, atandatu: 6,
  karindwi: 7, birindwi: 7, zirindwi: 7, arindwi: 7,
  umunani: 8, munani: 8,
  icyenda: 9, cyenda: 9,
  icumi: 10,
};

function rwNumber(word: string | undefined): number | null {
  if (!word) return null;
  if (/^\d+([.,]\d+)?$/.test(word)) return Number(word.replace(",", "."));
  return RW_NUMBERS[word] ?? null;
}

/** All money amounts mentioned in a clause, in order, with their position. */
export function findAmounts(clause: string): { value: number; index: number; raw: string }[] {
  const out: { value: number; index: number; raw: string }[] = [];
  const text = clause.toLowerCase();
  // "ibihumbi 5" / "ibihumbi bitanu" (thousands), "igihumbi" (1,000), "miliyoni 2"
  for (const m of text.matchAll(/\b(ibihumbi|igihumbi|miliyoni|million)\s*(\d+(?:[.,]\d+)?|[a-z]+)?/g)) {
    const n = m[1] === "igihumbi" ? 1 : rwNumber(m[2]) ?? (m[1] === "miliyoni" || m[1] === "million" ? 1 : null);
    if (n == null) continue;
    const mult = m[1] === "miliyoni" || m[1] === "million" ? 1_000_000 : 1000;
    out.push({ value: Math.round(n * mult), index: m.index!, raw: m[0] });
  }
  // 5,000 / 5 000 / 5000 / 5k / 1.5m / 2.5 million, optional currency on either side
  const re = /(?:(rwf|frw|rf|amafaranga|frs?)\s*)?(\d{1,3}(?:[, ]\d{3})+|\d+(?:\.\d+)?)\s*(k|m|million|thousand|rwf|frw|rf|frs?|amafaranga)?(?![a-z0-9])/g;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const idx = m.index!;
    if (out.some((o) => idx >= o.index && idx < o.index + o.raw.length)) continue;
    let n = Number(m[2]!.replace(/[, ]/g, ""));
    const suffix = m[3];
    if (suffix === "k" || suffix === "thousand") n *= 1000;
    if (suffix === "m" || suffix === "million") n *= 1_000_000;
    // Skip things that are clearly not money: quantities with units, dates, times, years, percentages.
    const after = text.slice(idx + raw.length, idx + raw.length + 12);
    const before = text.slice(Math.max(0, idx - 3), idx);
    if (!m[1] && !suffix) {
      if (/^\s*(kg|kilo|kilos|g|gram|l|ltr|litre|liter|litres|liters|litiro|pcs|pieces|piece|bags?|sacks?|trays?|bottles?|packets?|bars?|tubes?|dozen|x|%|am|pm|h|min|days?|weeks?|months?|iminsi|ibyumweru|amezi|th|st|nd|rd)\b/.test(after)) continue;
      if (/^:\d/.test(after) || /\d:$/.test(before)) continue;
      if (/^[-/.]\d/.test(after) || /[-/]$/.test(before)) continue;
      if (n >= 1900 && n <= 2100 && /\b(19|20)\d{2}\b/.test(raw) && /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\/|-)/.test(text.slice(Math.max(0, idx - 12), idx))) continue;
      if (n < 50 && !/(rwf|frw|amafaranga)/.test(text)) continue; // "2 moto rides", "3 kids"
    }
    if (n > 0 && Number.isFinite(n)) out.push({ value: Math.round(n), index: idx, raw });
  }
  return out.sort((a, b) => a.index - b.index);
}

/* ----------------------------------------------------------------- dates */

const WEEKDAYS: [RegExp, number][] = [
  [/\b(on )?sunday\b|ku cyumweru/, 0],
  [/\b(on )?monday\b|kuwa mbere|ku wa mbere/, 1],
  [/\b(on )?tuesday\b|kuwa kabiri|ku wa kabiri/, 2],
  [/\b(on )?wednesday\b|kuwa gatatu|ku wa gatatu/, 3],
  [/\b(on )?thursday\b|kuwa kane|ku wa kane/, 4],
  [/\b(on )?friday\b|kuwa gatanu|ku wa gatanu/, 5],
  [/\b(on )?saturday\b|kuwa gatandatu|ku wa gatandatu/, 6],
];

export function findDate(clause: string, today: string): string | null {
  const t = clause.toLowerCase();
  const d = parseISO(today);
  if (/\b(day before yesterday)\b|ejobundi/.test(t)) return format(addDays(d, -2), "yyyy-MM-dd");
  if (/\byesterday\b|ejo hashize|\bejo\b/.test(t)) return format(addDays(d, -1), "yyyy-MM-dd");
  if (/\btoday\b|\bthis morning\b|\btonight\b|uyu munsi|none aha|muri iki gitondo/.test(t)) return today;
  for (const [re, dow] of WEEKDAYS) {
    if (re.test(t)) {
      let diff = getDay(d) - dow;
      if (diff <= 0) diff += 7;
      if (/\blast\b|gishize/.test(t) && diff < 7) diff += 0;
      return format(addDays(d, -diff === 0 ? -7 : -diff), "yyyy-MM-dd");
    }
  }
  const explicit = parseReceiptDate(clause).date;
  if (explicit) return explicit;
  const m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.exec(t) ?? /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/.exec(t);
  if (m) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const [day, mon] = /\d/.test(m[1]!) ? [Number(m[1]), m[2]!] : [Number(m[2]), m[1]!];
    let candidate = new Date(d.getFullYear(), months.indexOf(mon.slice(0, 3)), day);
    if (candidate > d) candidate = new Date(d.getFullYear() - 1, candidate.getMonth(), day);
    return format(candidate, "yyyy-MM-dd");
  }
  return null;
}

/* ------------------------------------------------------------ categories */

const CATEGORY_WORDS: [string, string[]][] = [
  [CAT.rent, ["rent", "landlord", "ubukode", "inzu"]],
  [CAT.utilities, ["electricity", "power", "reg", "cash power", "cashpower", "water", "wasac", "gas", "umuriro", "amazi", "gaz", "utilities"]],
  [CAT.transport, ["moto", "motor", "taxi", "bus", "fare", "transport", "fuel", "petrol", "diesel", "lisansi", "itike", "urugendo", "yego", "uber", "move", "car", "imodoka"]],
  [CAT.health, ["pharmacy", "medicine", "medicines", "hospital", "clinic", "doctor", "mutuelle", "imiti", "ibitaro", "muganga", "farumasi", "health"]],
  [CAT.education, ["school", "fees", "books", "tuition", "uniform", "ishuri", "amashuri", "ibitabo", "minerval", "university", "kaminuza"]],
  [CAT.communication, ["airtime", "data", "bundle", "bundles", "internet", "mtn", "airtel", "wifi", "inite", "ama inite", "interineti", "phone credit"]],
  [CAT.subscriptions, ["netflix", "showmax", "canal", "canal+", "dstv", "startimes", "spotify", "subscription", "gym", "youtube premium", "ifatabuguzi"]],
  [CAT.dining, ["restaurant", "lunch", "dinner", "breakfast", "coffee", "snack", "snacks", "brochette", "brochettes", "pizza", "chips", "resitora", "ifunguro", "ikawa", "icyayi", "tea", "fanta", "soda"]],
  [CAT.entertainment, ["cinema", "movie", "movies", "party", "concert", "game", "games", "beer", "beers", "drinks", "inzoga", "ibirori", "club", "outing"]],
  [CAT.clothing, ["clothes", "shoes", "shirt", "dress", "trousers", "jacket", "imyenda", "inkweto", "ishati", "ikanzu"]],
  [CAT.personal, ["haircut", "salon", "barber", "cosmetics", "lotion", "perfume", "kogosha", "gusuka"]],
  [CAT.gifts, ["gift", "gifts", "wedding", "ubukwe", "impano", "contribution", "umusanzu", "funeral", "ikiriyo", "church", "tithe", "itorero", "icyacumi"]],
  [CAT.family, ["family", "parents", "mum", "mom", "dad", "mother", "father", "sister", "brother", "umuryango", "ababyeyi", "mama", "papa", "data", "murumuna", "mukuru"]],
  [CAT.household, ["soap", "detergent", "cleaning", "charcoal", "toilet paper", "isabune", "amakara", "omo", "household", "candles", "buji"]],
  [CAT.groceries, ["groceries", "grocery", "food", "rice", "beans", "milk", "bread", "sugar", "oil", "vegetables", "veg", "fruit", "fruits", "market", "supermarket", "simba", "meat", "fish", "eggs", "flour", "potatoes", "tomatoes", "onions", "bananas", "matoke", "maize", "cassava", "salt", "umuceri", "ibishyimbo", "amata", "umugati", "isukari", "amavuta", "imboga", "imbuto", "inyama", "amafi", "amagi", "ifu", "ibirayi", "inyanya", "ibitunguru", "ibitoki", "isoko", "ibiryo", "ibiribwa", "umunyu", "kawunga", "ubugari", "avocado", "avoka"]],
];

const ESSENTIAL = new Set<string>([CAT.groceries, CAT.rent, CAT.utilities, CAT.transport, CAT.health, CAT.education, CAT.communication, CAT.household, CAT.family]);

export function guessCategory(text: string): string {
  const t = norm(text);
  // "data" is also Kinyarwanda for "my father"; treat it as family only with a family-ish verb.
  for (const [cat, words] of CATEGORY_WORDS) if (has(t, words.filter((w) => !(cat === CAT.family && w === "data")))) return cat;
  return CAT.other;
}

function guessIncomeCategory(text: string): string {
  const t = norm(text);
  if (has(t, ["salary", "umushahara", "payroll", "wage", "wages", "nahembwe", "yahembwe", "hembwe"])) return CAT.salary;
  if (has(t, ["client", "freelance", "contract", "consulting", "umukiriya", "akazi", "gig"])) return CAT.freelance;
  if (has(t, ["sold", "sales", "sale", "shop", "business", "customer", "nagurishije", "byagurishijwe", "ubucuruzi", "iduka"])) return CAT.business;
  return CAT.incomeOther;
}

/* ------------------------------------------------------- payment & payee */

function guessPayment(text: string): PaymentMethod {
  const t = norm(text);
  if (has(t, ["momo", "mobile money", "mtn money", "airtel money", "mokash", "kuri momo"])) return "momo";
  if (has(t, ["cash", "in hand", "mu ntoki", "kashi"])) return "cash";
  if (has(t, ["card", "visa", "mastercard", "ikarita"])) return "card";
  if (has(t, ["bank", "transfer", "banki", "bk", "equity", "i&m"])) return "bank";
  return "momo";
}

const KNOWN_PLACES = ["kimironko", "nyabugogo", "simba", "kicukiro", "remera", "nyamirambo", "musanze", "huye", "rubavu", "kigali heights", "sawa citi", "carrefour", "frulep", "kisimenti", "gisozi", "kacyiru", "kanombe"];

const title = (s: string) => s.replace(/\b([a-z])/g, (c) => c.toUpperCase());

function findPayee(clause: string, kind: "expense" | "income" | "price"): string {
  const t = clause.trim();
  const stop = "(?=\\s+(?:for|on|today|yesterday|this|last|with|using|via|by|and|na|uyu|ejo|kuri momo|in cash|mu ntoki|\\d)|[,.;!?]|$)";
  const patterns =
    kind === "income"
      ? [new RegExp(`\\bfrom\\s+([A-Za-z][\\w&'.\\- ]{1,40}?)${stop}`, "i"), new RegExp(`\\b(?:ku|kwa|kuri)\\s+([A-Za-z][\\w&'.\\- ]{1,40}?)${stop}`, "i")]
      : [
          new RegExp(`\\b(?:at|from|in)\\s+([A-Za-z][\\w&'.\\- ]{1,40}?)${stop}`, "i"),
          new RegExp(`\\b(?:to|paid)\\s+([A-Z][\\w&'.\\- ]{1,40}?)${stop}`),
          new RegExp(`\\b(?:i|muri|mu|ku)\\s+([A-Z][\\w&'.\\- ]{1,40}?)${stop}`),
        ];
  for (const p of patterns) {
    const m = p.exec(t);
    const name = m?.[1]?.trim();
    if (name && name.length >= 2 && !/^(the|a|an|my|our|kg|cash|momo|home|work|school|savings|bank)$/i.test(name)) return title(name.toLowerCase());
  }
  const lower = t.toLowerCase();
  const place = KNOWN_PLACES.find((p) => lower.includes(p));
  return place ? title(place) : "";
}

/* -------------------------------------------------------------- products */

const PRODUCT_WORDS: Record<string, string[]> = {
  rice: ["rice", "umuceri"],
  beans: ["beans", "ibishyimbo"],
  "maize-flour": ["maize flour", "kawunga", "ifu y'ibigori", "ifu y ibigori"],
  "cassava-flour": ["cassava flour", "ubugari", "ifu y'imyumbati", "ifu y imyumbati"],
  sugar: ["sugar", "isukari"],
  salt: ["salt", "umunyu"],
  "cooking-oil": ["cooking oil", "oil", "amavuta"],
  "irish-potatoes": ["irish potatoes", "potatoes", "ibirayi"],
  tomatoes: ["tomatoes", "tomato", "inyanya"],
  onions: ["onions", "onion", "ibitunguru"],
  "cooking-bananas": ["cooking bananas", "matoke", "ibitoki"],
  avocados: ["avocados", "avocado", "avoka"],
  "passion-fruit": ["passion fruit", "marakuja"],
  milk: ["milk", "amata"],
  eggs: ["eggs", "egg", "amagi"],
  beef: ["beef", "meat", "inyama"],
  tilapia: ["tilapia", "fish", "amafi", "isambaza"],
  soap: ["soap", "isabune"],
  detergent: ["detergent", "washing powder", "omo"],
  charcoal: ["charcoal", "amakara"],
  toothpaste: ["toothpaste", "umuti w'amenyo"],
};

function matchProduct(name: string, products: ParseContext["products"]) {
  const n = norm(name);
  for (const [slug, words] of Object.entries(PRODUCT_WORDS)) {
    if (words.some((w) => n === w || n.includes(w))) {
      const p = products.find((x) => x.slug === slug);
      if (p) return p;
    }
  }
  return products.find((p) => norm(p.name).includes(n) || n.includes(norm(p.name).replace(/ \(.*\)/, ""))) ?? null;
}

const UNIT_RE = /(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilo|kilos|kilogram|g|grams?|l|ltr|litres?|liters?|litiro|pcs|pieces?|bags?|sacks?|trays?|bottles?|packets?|bars?|tubes?|dozen|ibiro)\b/i;
const UNIT_MAP: Record<string, string> = { kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", ibiro: "kg", grams: "g", gram: "g", ltr: "litre", litres: "litre", liters: "litre", liter: "litre", l: "litre", litiro: "litre", pcs: "piece", pieces: "piece", bags: "bag", sacks: "sack", trays: "tray", bottles: "bottle", packets: "packet", bars: "bar", tubes: "tube" };

/* -------------------------------------------------------------- intents */

type Intent = "expense" | "income" | "savings" | "shopping" | "price" | "bill" | "question" | null;

const Q_WORDS = ["how much", "how many", "what is my", "what's my", "whats my", "show me", "do i have", "am i", "where does", "where is my money", "when will", "angahe", "ni angahe", "mfite angahe", "nasigaranye", "bisigaye", "ese ", "nakoresheje angahe", "ni iki"];

function intentOf(c: string): Intent {
  const t = norm(c);
  if (t.endsWith("?") || Q_WORDS.some((w) => t.includes(w))) {
    if (!/\b(spent|paid|bought|received)\b.*\d/.test(t) || t.endsWith("?")) return "question";
  }
  // "Buy 2 kg rice" / "Gura umuceri" with no money in it is a reminder, not a payment.
  if (/^(please\s+)?(buy|get|pick up|gura|uzagure)\b/.test(t.trim()) && findAmounts(c).length === 0) return "shopping";
  if (has(t, ["need to buy", "need", "must buy", "have to buy", "to buy", "buy later", "add to list", "add to the list", "shopping list", "remind me to buy", "nkeneye", "tugomba kugura", "ngomba kugura", "nzagura", "ndashaka kugura", "shyira ku rutonde", "ongeraho ku rutonde", "ku rutonde"]) && !has(t, ["bought", "spent", "paid", "naguze"])) return "shopping";
  if (has(t, ["every month", "each month", "per month", "monthly", "every week", "weekly", "every year", "yearly", "per term", "every term", "each term", "quarterly", "due", "due on", "is due", "subscription", "buri kwezi", "buri cyumweru", "buri mwaka", "buri gihembwe", "fagitire", "bill is"]) && !has(t, ["paid", "spent", "nishyuye", "natanze"])) return "bill";
  if (has(t, ["saved", "save", "put", "deposited", "deposit", "nabitse", "nazigamye", "kuzigama", "nashyize", "bwizigame", "ubwizigame", "savings"]) && has(t, ["saved", "savings", "save", "nabitse", "nazigamye", "kuzigama", "bwizigame", "ubwizigame", "emergency", "goal", "intego"])) return "savings";
  if (has(t, ["costs", "cost", "price", "prices", "sells at", "selling at", "is selling", "per kg", "a kilo", "per kilo", "per litre", "igiciro", "ku kilo", "kuri kilo", "ikilo", "ni amafaranga"]) && !has(t, ["spent", "paid", "bought", "naguze", "nishyuye", "nakoresheje"])) return "price";
  if (has(t, ["received", "receive", "got paid", "earned", "earn", "salary", "income", "was paid", "paid me", "sold", "profit", "nahembwe", "nakiriye", "nabonye", "umushahara", "nagurishije", "nungutse", "binjije", "yanyoherereje", "banyishyuye", "nishyuwe", "inyungu"])) return "income";
  if (has(t, ["spent", "spend", "paid", "pay", "bought", "buy", "bill", "cost me", "gave", "sent", "naguze", "nishyuye", "natanze", "nakoresheje", "naguriye", "kugura", "nohereje", "naraguze", "nagiye"])) return "expense";
  return null;
}

/* ------------------------------------------------------------- splitting */

function splitClauses(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n+|;|(?<=[.!?])\s+(?=[A-Za-z0-9])|\s+(?:and then|then|after that|nyuma|hanyuma)\s+/i)
    .flatMap((part) => {
      // "spent 2000 on moto and 6500 on lunch" → two clauses when each side has an amount
      // (a comma inside "2,000" is not a break: only ", " with a space is)
      // Kinyarwanda contracts "na" before a vowel: "amata 1500 n'umugati 1000".
      const pieces = part.split(/\s+(?:and|na)\s+|\s+n['’](?=[a-z])|,\s+(?=[^,]*\d)/i);
      if (pieces.length > 1 && pieces.filter((p) => findAmounts(p).length > 0).length >= 2) return pieces;
      return [part];
    })
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

/* ------------------------------------------------------------- builders */

function cleanTitle(clause: string, amountRaw: string, payee: string, type: "expense" | "income"): string {
  // A known product makes the clearest name: "1kg of rice for 1500" → "Rice (1 kg)".
  if (type === "expense") {
    const n = norm(clause);
    for (const words of Object.values(PRODUCT_WORDS)) {
      const w = words.find((x) => has(n, [x]));
      if (w) {
        const u = UNIT_RE.exec(clause);
        const unit = u ? ` (${u[1]} ${UNIT_MAP[u[2]!.toLowerCase()] ?? u[2]!.toLowerCase()})` : "";
        return title(w) + unit;
      }
    }
  }
  let s = clause
    .replace(amountRaw, " ")
    .replace(/\b(i|we|have|has|just|today|yesterday|this morning|tonight|on|for|at|from|to|in|with|via|using|my|the|a|an|some|of|rwf|frw|rf|amafaranga|uyu munsi|ejo hashize|ejo|kuri|ku|mu|muri|kwa|na|nka|cash|momo|mobile money|by|or|and|also|then)\b/gi, " ")
    .replace(/\b(spent|spend|paid|pay|bought|buy|purchased|received|receive|got paid|got|earned|sold|gave|sent|naguze|nishyuye|natanze|nakoresheje|naguriye|nakiriye|nahembwe|nabonye|nagurishije|nohereje)\b/gi, " ")
    .replace(payee ? new RegExp(payee, "i") : /$^/, " ")
    .replace(/[^\p{L}\p{N}&'\- ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length < 2) s = type === "income" ? "Income" : payee ? `Payment to ${payee}` : "Expense";
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

function frequencyOf(t: string): RecurringFrequency {
  if (has(t, ["every week", "weekly", "per week", "buri cyumweru"])) return "weekly";
  if (has(t, ["every year", "yearly", "per year", "annually", "buri mwaka"])) return "yearly";
  if (has(t, ["per term", "every term", "each term", "quarterly", "every 3 months", "buri gihembwe"])) return "quarterly";
  return "monthly";
}

function nextDueOf(t: string, today: string): string {
  const d = parseISO(today);
  const dom = /\b(?:on (?:the )?|due (?:on )?(?:the )?|tariki ya |ku itariki ya |ku ya )(\d{1,2})(?:st|nd|rd|th)?\b/.exec(t);
  if (dom) {
    const day = Math.min(28, Math.max(1, Number(dom[1])));
    let candidate = setDate(d, day);
    if (candidate < d) candidate = setDate(addMonths(d, 1), day);
    return format(candidate, "yyyy-MM-dd");
  }
  const explicit = findDate(t, today);
  if (explicit && explicit !== today) {
    const e = parseISO(explicit);
    return format(e < d ? addMonths(e, 1) : e, "yyyy-MM-dd");
  }
  return format(addMonths(d, 1), "yyyy-MM-dd");
}

function shoppingItems(clause: string, ctx: ParseContext): ShoppingDraft[] {
  const body = clause
    .replace(/^.*?\b(need to buy|need|must buy|have to buy|to buy|buy later|remind me to buy|add|nkeneye kugura|nkeneye|tugomba kugura|ngomba kugura|nzagura|ndashaka kugura|shyira|ongeraho)\b/i, "")
    .replace(/\b(to|on|ku)\s+(the\s+)?(shopping\s+)?(list|rutonde)\b.*$/i, "")
    .trim();
  const parts = body.split(/,|\s+and\s+|\s+na\s+|\s+n'/i).map((p) => p.trim()).filter(Boolean);
  const items: ShoppingDraft[] = [];
  for (const raw of parts) {
    let qty = 1;
    let unit = "piece";
    let name = raw;
    const u = UNIT_RE.exec(raw);
    if (u) {
      qty = Number(u[1]!.replace(",", "."));
      unit = UNIT_MAP[u[2]!.toLowerCase()] ?? u[2]!.toLowerCase();
      name = raw.replace(u[0], " ");
    } else {
      const q = /^(\d+)\s+/.exec(raw);
      if (q) {
        qty = Number(q[1]);
        name = raw.slice(q[0].length);
      }
    }
    const priceM = /(?:for|at|@|ya|ku)\s*(\d[\d, ]*)\s*(?:rwf|frw|each|per\s+\w+|imwe)?/i.exec(name);
    const price = priceM ? Number(priceM[1]!.replace(/[, ]/g, "")) : null;
    if (priceM) name = name.replace(priceM[0], " ");
    name = name.replace(/\b(of|some|a|an|the|y'|ya|z'|za|w'|wa|kg|litres?|bags?)\b/gi, " ").replace(/[^\p{L}' -]/gu, " ").replace(/\s+/g, " ").trim();
    if (name.length < 2) continue;
    const product = matchProduct(name, ctx.products);
    items.push({
      id: ctx.newId(),
      kind: "shopping",
      source: raw,
      missing: [],
      include: true,
      productName: product ? product.name.replace(/ \(.*\)/, "") : title(name),
      marketProductId: product?.id ?? null,
      category: product?.category ?? (guessCategory(name) === CAT.household ? "Household supplies" : "Food"),
      quantity: qty > 0 ? qty : 1,
      unit: product && unit === "piece" ? product.unit : unit,
      estimatedUnitPrice: price && price > 0 ? price : null,
      priority: /\burgent|asap|today|vuba|uyu munsi\b/i.test(clause) ? "high" : "medium",
    });
  }
  return items;
}

/* ---------------------------------------------------------------- main */

/** "put that data into my data base", "save it", "record this", "bibike", "andika ibi". */
const SAVE_CMD = /[,.;]?\s*(?:and\s+|then\s+|please\s+|pls\s+)*(?:(?:put|add|save|record|store|enter|insert|log|keep|write)\s+(?:all\s+)?(?:that|this|these|it|them|those|the)?\s*(?:data|info|information|records?|entries|transactions?|expenses?)?\s*(?:(?:in|into|to|on)\s+(?:my|our|the)?\s*(?:data\s*base|database|db|system|platform|app|trust manager|records?|account|books?))?|(?:bi|ibi|byose)?\s*(?:bike|bibike|bika|byandike|andika|andika ibi|shyira mu (?:bubiko|sisitemu|system)))\s*(?:please|pls|for me|now|nonaha)?\s*[.!]?\s*$/i;

/** Common typing slips that change meaning ("brought" for "bought", "to day"). */
function tidyInput(text: string): string {
  return text
    .replace(/\bto\s+day\b/gi, "today")
    .replace(/\bi\s*have\b/gi, "I have")
    .replace(/\bihave\b/gi, "I have")
    .replace(/\b(purchased|brought|buyed)\s+or\s+(bought|purchased|brought)\b/gi, "bought")
    .replace(/\bbrought\b(?=[^.]*\d)/gi, "bought")
    .replace(/\bpurchased\b/gi, "bought");
}

export function parseMessage(rawText: string, ctx: ParseContext): ParseResult {
  let text = tidyInput(rawText.trim());
  let saveRequested = false;
  const cmd = SAVE_CMD.exec(text);
  // Only a trailing command counts, and only when something else is left to save.
  if (cmd && cmd.index > 0 && /\d/.test(text.slice(0, cmd.index))) {
    saveRequested = true;
    text = text.slice(0, cmd.index).trim();
  }
  const drafts: Draft[] = [];
  const questions: QuestionTopic[] = [];
  let carryIntent: Intent = null;
  let carryDate: string | null = null;
  let carryPayment: PaymentMethod | null = null;

  for (const clause of splitClauses(text)) {
    const t = norm(clause);
    // "Who developed you?" / "Ninde wagukoze?"
    if (/\b(who|ninde|nde)\b.*\b(made|make|built|build|created|create|developed|develop|designed|owns)\b|\b(developer|creator|founder)\b|wagukoze|yagukoze|yakoze|uwagukoze|uwakoze|wakoze/.test(t) && !findAmounts(clause).length) {
      questions.push("about");
      continue;
    }
    let intent = intentOf(clause);
    const amounts = findAmounts(clause);
    if (!intent && amounts.length && carryIntent && carryIntent !== "question") intent = carryIntent;
    if (!intent && amounts.length) intent = "expense";
    if (!intent) {
      if (/^(hi|hello|hey|muraho|mwaramutse|mwiriwe|bite|amakuru|help|ubufasha)\b/.test(t)) questions.push("help");
      continue;
    }
    const date: string = findDate(clause, ctx.today) ?? carryDate ?? ctx.today;
    const explicitPay = /momo|mobile money|cash|card|visa|bank|transfer|ntoki|banki/.test(t);
    const payment: PaymentMethod = explicitPay ? guessPayment(clause) : carryPayment ?? "momo";
    carryIntent = intent;
    carryDate = date;
    if (explicitPay) carryPayment = payment;
    const amount = amounts[0]?.value ?? null;
    const amountRaw = amounts[0]?.raw ?? "";

    switch (intent) {
      case "question":
        questions.push(questionTopic(t));
        break;

      case "shopping":
        drafts.push(...shoppingItems(clause, ctx));
        break;

      case "savings": {
        const goal =
          ctx.goals.find((g) => t.includes(norm(g.name).split(/[ —-]/)[0]!)) ??
          (has(t, ["emergency", "ingoboka", "byihutirwa"]) ? ctx.goals.find((g) => /emergency/i.test(g.name)) : undefined) ??
          null;
        const d: SavingsDraft = { id: ctx.newId(), kind: "savings", source: clause, missing: amount == null ? ["amount"] : [], include: true, amount, goalId: goal?.id ?? null, goalName: goal?.name ?? null, date };
        drafts.push(d);
        break;
      }

      case "price": {
        const productWord = Object.entries(PRODUCT_WORDS).find(([, ws]) => ws.some((w) => t.includes(w)));
        const product = productWord ? ctx.products.find((p) => p.slug === productWord[0]) ?? null : null;
        const nameGuess = product?.name ?? (productWord ? title(productWord[1][0]!) : title(t.split(/\s+(?:is|costs?|ni|price|igiciro)\b/)[0]!.replace(/\b(the|price of|igiciro cy'?|cya)\b/g, "").trim().slice(0, 40)));
        const unitM = /(?:per|a|\/|ku|kuri)\s*(kg|kilo|litre|liter|piece|tray|bag|sack|bar|tube|ikilo|litiro)/i.exec(clause);
        const d: PriceDraft = {
          id: ctx.newId(),
          kind: "price",
          source: clause,
          missing: [...(amount == null ? ["price"] : []), ...(!nameGuess ? ["productName"] : [])],
          include: true,
          productName: nameGuess || "",
          marketProductId: product?.id ?? null,
          unit: product?.unit ?? (unitM ? UNIT_MAP[unitM[1]!.toLowerCase()] ?? unitM[1]!.toLowerCase().replace("ikilo", "kg") : "kg"),
          price: amount,
          marketName: findPayee(clause, "price"),
          date,
        };
        if (!d.marketName) d.missing.push("marketName");
        drafts.push(d);
        break;
      }

      case "bill": {
        const name = title(
          clause
            .replace(amountRaw, " ")
            .replace(/\b(every|each|per|month|monthly|week|weekly|year|yearly|term|quarterly|due|on|the|is|are|my|our|of|rwf|frw|bill|buri|kwezi|cyumweru|mwaka|gihembwe|tariki|ya|ni|fagitire|subscription)\b/gi, " ")
            .replace(/\b\d{1,2}(st|nd|rd|th)?\b/g, " ")
            .replace(/[^\p{L} ]/gu, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase(),
        ) || "Bill";
        const cat = guessCategory(clause);
        const billKind: BillDraft["billKind"] = has(t, ["loan", "inguzanyo", "credit", "sacco loan"]) ? "loan" : cat === CAT.subscriptions || has(t, ["subscription", "ifatabuguzi"]) ? "subscription" : "bill";
        const CAT_NAMES: Record<string, string> = { [CAT.rent]: "Rent & Housing", [CAT.utilities]: "Utilities", [CAT.communication]: "Airtime & Internet", [CAT.education]: "Education", [CAT.subscriptions]: "Subscriptions", [CAT.health]: "Insurance" };
        drafts.push({
          id: ctx.newId(),
          kind: "bill",
          source: clause,
          missing: amount == null ? ["amount"] : [],
          include: true,
          name: name.length > 40 ? name.slice(0, 40) : name,
          amount,
          billKind,
          category: billKind === "loan" ? "Loans" : CAT_NAMES[cat] ?? "Other",
          frequency: frequencyOf(t),
          nextDueDate: nextDueOf(t, ctx.today),
          essential: billKind !== "subscription",
        });
        break;
      }

      case "expense":
      case "income": {
        // Several amounts in one clause without a split ("rice 5000 beans 3000") → one draft per amount.
        // Each amount owns the words from itself to the next amount ("2,000 on moto … 6,500 on lunch").
        const slices = amounts.length > 1 ? amounts.map((a, i) => clause.slice(i === 0 ? 0 : a.index, amounts[i + 1]?.index ?? clause.length)) : [clause];
        const list = amounts.length > 1 ? amounts : [amounts[0] ?? null];
        list.forEach((a, i) => {
          const piece = slices[i] ?? clause;
          const payee = findPayee(clause, intent === "income" ? "income" : "expense");
          const categoryId = intent === "income" ? guessIncomeCategory(clause) : guessCategory(piece) !== CAT.other ? guessCategory(piece) : guessCategory(clause);
          const d: TransactionDraft = {
            id: ctx.newId(),
            kind: "transaction",
            type: intent,
            source: clause,
            missing: a == null ? ["amount"] : [],
            include: true,
            title: cleanTitle(piece, a?.raw ?? "", payee, intent),
            amount: a?.value ?? null,
            date,
            time: date === ctx.today ? ctx.nowTime : "12:00",
            categoryId,
            merchant: payee,
            paymentMethod: payment,
            essential: intent === "income" ? true : ESSENTIAL.has(categoryId),
            planned: !has(t, ["impulse", "unplanned", "by mistake", "sinabiteguye", "ntabyo nari nateganyije"]),
          };
          drafts.push(d);
        });
        break;
      }
    }
  }
  return { drafts, questions: [...new Set(questions)], saveRequested };
}

function questionTopic(t: string): QuestionTopic {
  if (has(t, ["run out", "last until", "zero", "bizarangira", "azashira", "azarangira"])) return "run_out";
  if (has(t, ["safe", "can i spend", "allowed", "nshobora gukoresha", "nemerewe"])) return "safe_today";
  if (has(t, ["bill", "bills", "due", "fagitire", "kwishyura"])) return "bills_due";
  if (has(t, ["saved", "savings", "save", "nzigamye", "ubwizigame", "nabitse"])) return "savings";
  if (has(t, ["earn", "earned", "income", "received", "winjije", "ninjije", "nakiriye", "byinjiye"])) return "income_month";
  if (has(t, ["who", "payee", "receives", "nde", "uwo nishyura"])) return "top_payee";
  if (has(t, ["where", "category", "most", "aho", "byinshi"])) return "top_category";
  if (has(t, ["left", "remaining", "remain", "bisigaye", "nasigaranye", "asigaye", "budget"])) return "budget_left";
  if (has(t, ["balance", "have", "available", "mfite", "ahari", "konti"])) return "balance";
  if (has(t, ["today", "uyu munsi"])) return "spent_today";
  if (has(t, ["week", "icyumweru", "iki cyumweru"])) return "spent_week";
  if (has(t, ["month", "ukwezi", "uku kwezi"])) return "spent_month";
  if (has(t, ["spent", "spend", "nakoresheje", "byakoreshejwe"])) return "spent_month";
  return "help";
}
