# Trust Manager

AI-powered household financial management for households in Rwanda and beyond. Track money in and out, follow daily/weekly/monthly budgets, scan MoMo and bank receipts (images are never stored), compare shopping plans against market prices, get bulk-buy and savings suggestions, manage bills and subscriptions, and share the household with family members under fine-grained permissions.

> **For real users, connect Supabase** (section 2) so accounts and data work on every phone and computer. Without Supabase keys the app runs in an offline mode that keeps data only in that browser. It starts empty either way: there is no sample household.

---

## 1. Run it on your computer

**You need:** [Node.js 20 or newer](https://nodejs.org) (LTS). Check with `node -v`.

```bash
cd "E:\Trust manager"      # or wherever the project is
npm install
npm run dev
```

Open **http://localhost:3000**.

Click **Create an account** and go through the 5-step setup with your own numbers. In offline mode, **Settings → Erase data on this device** wipes everything stored in that browser.

### Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app in development |
| `npm run build && npm start` | Production build and server |
| `npm test` | Unit tests (budget, classification, prediction, bulk-buy, permissions, receipt and statement reading, assistant) |
| `npm run typecheck` / `npm run lint` | Type and lint checks |
| `npm run db:seed-sql` | Regenerate `supabase/seed.sql` (categories + product list, no prices) |

---

## 2. Connect Supabase (real database & accounts)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run these in order (each in a **New query**, choose **Run and enable RLS** if asked):
   1. `supabase/migrations/20261110000000_init.sql` — tables, access rules, functions
   2. `supabase/seed.sql` — spending categories and the shared product list (no prices)
   3. `supabase/migrations/20261110170000_real_market_prices.sql` — lets households record real prices, removes the old demo prices, and adds the one-request loader that makes pages open faster. Safe to run more than once.

   (Or with the Supabase CLI: `supabase link` then `supabase db push`.)
3. **Authentication → Providers → Email**: keep enabled. For quick testing you can turn off "Confirm email".
4. Copy `.env.example` to `.env.local` and set:
   ```
   NEXT_PUBLIC_DATA_MODE=supabase
   NEXT_PUBLIC_SUPABASE_URL=...      # Project Settings → API
   NEXT_PUBLIC_SUPABASE_ANON_KEY=... # the "anon public" key — never the service role key
   ```
5. Restart `npm run dev` and register a new account.

Row Level Security is enabled and **forced** on every table. Household data is scoped by `household_id` and checked with `has_perm()` in the database, so hiding something in the UI is never the only protection. `supabase/tests/rls_scenarios.sql` contains the access scenarios used to verify this (outsider, contributor without balances, viewer, invitations, append-only audit log).

---

## 3. Deploy (Vercel)

1. Import the GitHub repository at [vercel.com/new](https://vercel.com/new).
2. Add the same environment variables as `.env.local`.
3. Deploy. The app is installable as a PWA (manifest + icons included).

---

## Architecture

```
src/
├── app/                      Next.js App Router
│   ├── (auth)/               login · register · forgot/reset password · onboarding (mandatory)
│   ├── (dashboard)/          overview · transactions · budget · shopping · market · savings
│   │                         bills · analytics · vision · household · advisor · settings
│   ├── api/transactions/validate   server-side validation for every transaction
│   └── invite/[token]        secure, expiring household invitations
├── components/               ui kit (shadcn-style), layout, feature components, charts
├── lib/
│   ├── receipts/             receipt text parser (MoMo, Airtel, bank, shop invoices)
│   ├── calculations/         pure, unit-tested engines: balance, budget, classification,
│   │                         prediction, schedule, market, bulk-buy, insights, snapshot
│   ├── data/                 DataStore (LocalStore | SupabaseStore) + permission-aware API
│   ├── permissions/          role defaults + owner overrides (mirrors database RLS)
│   └── validations/          Zod schemas shared by forms and API routes
├── services/                 OCR · market · advisor · notifications · savings transfer ·
│                             auth · onboarding · budget · prediction · account
├── server/                   server-only helpers (rate limiting)
├── stores/                   Zustand (session pointer, UI state only)
└── hooks/                    TanStack Query hooks (useList, useAction, useFinance)
supabase/
├── migrations/               schema, triggers, RLS, RPCs
├── seed.sql                  categories + shared product list (no prices)
└── tests/                    RLS scenario script
```

**Money** is stored as integers in the currency's minor unit (RWF has none). **Time** is stored in UTC; days, weeks (Mon–Sun) and months are computed in the household's time zone (default Africa/Kigali).

**All totals are derived** from transaction, budget and savings records through `buildSnapshot()` — there are no separately maintained counters.

### Services (each behind an interface, so a provider can be swapped in)

| Service | What runs today |
|---|---|
| Receipt reading (`OCRService`) | **Real, on the device**: Tesseract (WebAssembly) reads the image in the browser, then a parser extracts amount, payee, date, reference, fee and balance from MoMo, Airtel, bank and shop receipts |
| Market prices (`MarketPriceProvider`) | **Real prices your household records** ("Record a price", or automatically when you mark a shopping item bought). |
| Advisor (`FinancialAdvisor`) | Rules over your real records; facts and estimates are shown separately |
| Notifications (`NotificationService`) | In-app notifications are real; email/push have no provider yet |
| Savings transfers (`SavingsTransferService`) | Recorded inside Trust Manager only — no MoMo or bank money is moved |

### Assistant (AI button, bottom right)

Tell it your day in English or Kinyarwanda ("I spent 5,000 on transport and 12k on groceries", "Naguze isukari 3000", "Save 20000 for school fees", "Rent 150,000 every month on the 5th", "Sugar costs 1,800 at Kimironko"). It turns each part into a record (expense, income, saving, shopping item, market price or bill) and **saves it straight away** when every detail is there; anything missing (a price, an amount) stays as a card to fill in. Receipts and statements are shown for checking first. Each record is saved to its own page through the same checks and permissions as the normal forms, and every total and chart updates from those records. You can also attach a receipt photo (read on the device), or a bank/MoMo statement as CSV or TXT (duplicates of records you already have are unticked). Questions like "How much did I spend this week?" are answered from your real figures.

**AI model (Google Gemini).** Add `GEMINI_API_KEY` (server-only, never `NEXT_PUBLIC_`) in Vercel and in `.env.local`, then redeploy / restart. Optional: `GEMINI_MODEL` (default `gemini-3.1-flash-lite`). Only the message, today's date, savings-goal names and product names are sent to Google; balances and history stay in the app, and questions are answered from your own figures. Only signed-in people can use it, and it's limited to 20 messages a minute per person. If the key is missing, the free quota runs out or Gemini fails, the built-in reader takes over automatically. The code is in `src/app/api/assistant/route.ts`, `src/server/assistant/gemini.ts` and `src/lib/assistant/ai.ts`.

### Currency and language

The coin button at the top shows every amount in another currency (USD, EUR, KES, UGX…). Rates come from [Exchange Rate API](https://www.exchangerate-api.com) and refresh every 12 hours; if they can't be fetched you can type a rate yourself. Records are always stored in the household's currency, so switching never changes your data. The language button switches between English and Kinyarwanda (the Kinyarwanda text should be reviewed by a native speaker; anything not yet translated falls back to English).

### Receipt privacy (zero storage)

Receipts are read **on the person's own device**. The image is never uploaded — not to Trust Manager's server and not to any third party — and is never written to localStorage, IndexedDB or a database. The reading engine and English language data are served by the app itself (`public/ocr`, copied from `node_modules` by `scripts/copy-ocr-assets.mjs` before every `dev`/`build`). When reading finishes or fails, the worker is terminated and the working canvas wiped in a `finally` block, and that cleanup is verified before success is reported. Only the fields the person confirms are saved.

### Speed

- Every page's data arrives in **one request** (`batch_select`, which runs as the signed-in user so Row Level Security still applies). If the database hasn't been updated yet, the app falls back to one request per table automatically.
- Sign-in lookups and the household/balance lookup run in parallel.
- The financial snapshot is computed once and shared by every page; data stays fresh for 2 minutes, so moving between pages doesn't wait on the network, and saving refreshes only what changed.
- Charts and the receipt reader load only when needed; the reader starts downloading as soon as the receipt dialog opens and is cached by the browser for a week.

Measured with a 150 ms delay on every database request: cold dashboard open went from ~830 ms to ~470 ms, and requests per open from 21 to 5. Moving between pages takes 30–200 ms.

---

## Honest limits of this version

- There is no live feed of Kigali market prices; comparisons use the prices your household records.
- Receipt reading works best on clear screenshots; every field is shown for checking before it is saved.
- Email/push reminders have no delivery provider yet; in-app reminders work. MoMo/bank transfers are never made by the app.
- In Supabase mode, account deletion is recorded as a request (`request_account_deletion`) for an operator job to complete, because auth users can only be deleted server-side.
- The rate limiter is in-memory per server instance; use Redis/Upstash for multi-instance production.
