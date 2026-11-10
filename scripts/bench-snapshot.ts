/** Measures how long the financial engines take with a large history. Run: npx tsx scripts/bench-snapshot.ts */
import { buildDemoDb } from "../src/test-fixtures/demo-household";
import { buildSnapshot } from "../src/lib/calculations/snapshot";

const NOW = new Date("2026-11-10T12:00:00Z");
(async () => {
  const db = await buildDemoDb(NOW);
  const base = db.transactions.filter((t) => t.type === "expense");
  for (const n of [34, 1000, 5000]) {
    const txs = [...db.transactions];
    for (let i = 0; txs.length < n; i++) {
      const b = base[i % base.length]!;
      txs.push({ ...b, id: `bench-${i}`, occurredAt: new Date(NOW.getTime() - (i % 365) * 86_400_000 - (i % 600) * 60_000).toISOString(), amount: 1000 + (i % 37) * 250 });
    }
    const data = {
      household: db.households[0]!, persona: db.personas[0]!, budget: db.budgets[0]!, transactions: txs, categories: db.categories, income: db.incomeSources,
      recurring: db.recurringPayments, subscriptionUsage: db.subscriptionUsage, savingsAccounts: db.savingsAccounts, savingsGoals: db.savingsGoals,
      contributions: db.savingsContributions, shoppingItems: db.shoppingItems, marketProducts: db.marketProducts, marketHistory: db.marketPriceHistory,
    };
    buildSnapshot(data, NOW);
    const t = performance.now();
    const runs = n > 1000 ? 1 : 5;
    for (let i = 0; i < runs; i++) buildSnapshot(data, NOW);
    console.log(`${String(txs.length).padStart(5)} transactions: ${((performance.now() - t) / runs).toFixed(1)} ms per snapshot`);
  }
})();
