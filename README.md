# Trust Manager

AI-powered household financial management for households in Rwanda and beyond. Track money in and out, follow daily/weekly/monthly budgets, scan MoMo and bank receipts (images are never stored), compare shopping plans against market prices, get bulk-buy and savings suggestions, manage bills and subscriptions, and share the household with family members under fine-grained permissions.

> **Development mode is the default.** Without Supabase keys the app runs entirely in your browser with a deterministic sample household, and every simulated service is labeled (market prices, OCR, advisor, email/push, savings transfers).

---

## 1. Run it on your computer

**You need:** [Node.js 20 or newer](https://nodejs.org) (LTS). Check with `node -v`.

```bash
cd "E:\Trust manager"      # or wherever the project is
npm install
npm run dev
```

Open **http://localhost:3000**.

### Demo accounts (password `demo1234`)

| Account | Role | What it shows |
|---|---|---|
| aline@demo.trustmanager.rw | Owner | Everything |
| eric@demo.trustmanager.rw | Administrator | Shared expenses, no owner-only settings |
| keza@demo.trustmanager.rw | Contributor | Groceries only — no transactions or balances |

You can also **Create an account** to go through the mandatory 5-step onboarding with your own numbers. **Settings → Reset demo data** restores the sample household at any time.

### Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app in development |
| `npm run build && npm start` | Production build and server |
| `npm test` | Unit tests (budget, classification, prediction, bulk-buy, permissions, OCR cleanup, seed) |
| `npm run typecheck` / `npm run lint` | Type and lint checks |
| `npm run db:seed-sql` | Regenerate `supabase/seed.sql` (categories + demo market index) |

---

## 2. Connect Supabase (real database & accounts)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run `supabase/migrations/20261110000000_init.sql`, then `supabase/seed.sql`.
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
│   ├── (auth)/               login · register · onboarding (mandatory)
│   ├── (dashboard)/          overview · transactions · budget · shopping · market · savings
│   │                         bills · analytics · vision · household · advisor · settings
│   ├── api/ocr               ephemeral receipt processing (in-memory, verified deletion)
│   ├── api/transactions/validate   server-side validation for every transaction
│   └── invite/[token]        secure, expiring household invitations
├── components/               ui kit (shadcn-style), layout, feature components, charts
├── lib/
│   ├── calculations/         pure, unit-tested engines: balance, budget, classification,
│   │                         prediction, schedule, market, bulk-buy, insights, snapshot
│   ├── data/                 DataStore (LocalStore | SupabaseStore) + permission-aware API
│   ├── permissions/          role defaults + owner overrides (mirrors database RLS)
│   └── validations/          Zod schemas shared by forms and API routes
├── services/                 OCR · market · advisor · notifications · savings transfer ·
│                             auth · onboarding · budget · prediction · account
├── server/                   server-only: OCR provider, temp store, rate limiting
├── stores/                   Zustand (session pointer, UI state only)
└── hooks/                    TanStack Query hooks (useList, useAction, useFinance)
supabase/
├── migrations/               schema, triggers, RLS, RPCs
├── seed.sql                  categories + DEMO market prices
└── tests/                    RLS scenario script
```

**Money** is stored as integers in the currency's minor unit (RWF has none). **Time** is stored in UTC; days, weeks (Mon–Sun) and months are computed in the household's time zone (default Africa/Kigali).

**All totals are derived** from transaction, budget and savings records through `buildSnapshot()` — there are no separately maintained counters.

### Mock services (same interfaces as the future real ones)

| Service | Contract | Development implementation |
|---|---|---|
| OCR | `OCRProvider` / `OCRService` | `MockOCRProvider` — deterministic output per image |
| Market prices | `MarketPriceProvider` | `MockMarketPriceService` — labeled demo index |
| Advisor | `FinancialAdvisor` | `MockFinancialAdvisor` — rules over your real records |
| Notifications | `NotificationService` | in-app real; email/push stored as `simulated` |
| Savings transfers | `SavingsTransferService` | records movements in-app only, labeled simulated |

### Receipt privacy (zero storage)

The browser sends the image to `/api/ocr`; the server validates type, size and magic bytes, holds the bytes **in memory only** with a 60-second TTL sweeper, extracts the data, zero-fills and deletes the buffer, and **verifies** the deletion in a `finally` block — also when extraction fails. The browser preview is an object URL revoked right after processing. Nothing image-related is written to localStorage, a database table, or logs. Receipts are never sent to third-party AI without consent (the route enforces a consent flag for any external provider).

---

## Honest limits of this version

- Market prices are a **simulated demo index**, not live data.
- OCR is a mock reader; plug a real provider into `src/server/ocr.ts`.
- Email/push delivery and MoMo/bank transfers are simulated and labeled as such.
- In Supabase mode, account deletion is recorded as a request (`request_account_deletion`) for an operator job to complete, because auth users can only be deleted server-side.
- The rate limiter is in-memory per server instance; use Redis/Upstash for multi-instance production.
