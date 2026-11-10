"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ReceiptUpload } from "@/components/receipts/ReceiptUpload";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { useFinance } from "@/hooks/use-finance";
import { useUIStore } from "@/stores/preferences.store";

export function GlobalDialogs() {
  const f = useFinance();
  const quick = useUIStore((s) => s.quickAddOpen);
  const setQuick = useUIStore((s) => s.setQuickAdd);
  const receipt = useUIStore((s) => s.receiptOpen);
  const setReceipt = useUIStore((s) => s.setReceiptOpen);
  const tz = f.household?.timezone ?? "Africa/Kigali";
  const currency = f.household?.currency ?? "RWF";
  return (
    <>
      <Dialog open={quick} onOpenChange={setQuick}>
        <DialogContent title="Add transaction" description="Every transaction updates your budget, balance and forecasts immediately." wide>
          {quick && <TransactionForm tz={tz} currency={currency} onDone={() => setQuick(false)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={receipt} onOpenChange={setReceipt}>
        <DialogContent title="Upload a receipt" description="We read the details, delete the image, and let you confirm before saving." wide>
          {receipt && <ReceiptUpload tz={tz} currency={currency} balance={f.can("view_balances") ? f.snapshot.balance : undefined} onDone={() => setReceipt(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
