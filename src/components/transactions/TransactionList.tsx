"use client";

import { History, MoreVertical, Pencil, RotateCcw, Tag, Trash2 } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/misc";
import { BehaviorBadge, ConfirmDialog } from "@/components/shared";
import { PAYMENT_METHOD_LABELS } from "@/constants";
import { useAction, useList } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import type { Classification } from "@/lib/calculations/classification";
import { fmtDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Behavior, Transaction, TransactionCategory } from "@/types";
import { removeTransaction, restoreTransaction } from "@/services/transaction.service";
import { TransactionForm } from "./TransactionForm";

const SOURCE_LABEL: Record<Transaction["source"], string> = {
  manual: "Manual",
  receipt_ocr: "Receipt scan",
  shopping_list: "Shopping list",
  recurring: "Bill / subscription",
  micro_savings: "Micro-savings",
};

export function TransactionList({
  transactions,
  categories,
  classifications,
  tz,
  currency,
  deleted,
}: {
  transactions: Transaction[];
  categories: TransactionCategory[];
  classifications: Map<string, Classification>;
  tz: string;
  currency: string;
  deleted?: boolean;
}) {
  const s = useSession();
  const { run, pending } = useAction();
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [details, setDetails] = useState<Transaction | null>(null);
  const [removing, setRemoving] = useState<Transaction | null>(null);
  const cat = new Map(categories.map((c) => [c.id, c]));
  const canEdit = s.can("edit_transactions");

  const setBehavior = (tx: Transaction, b: Behavior | null) =>
    run((api) => api.update("transactions", tx.id, { behaviorOverride: b }, "Classification corrected by user"), b ? "Classification updated." : "Back to automatic classification.");

  return (
    <>
      <ul className="divide-y divide-line">
        {transactions.map((tx) => {
          const c = classifications.get(tx.id);
          const income = tx.type === "income" || tx.type === "savings_withdrawal";
          return (
            <li key={tx.id} className="flex items-center gap-3 py-3">
              <button type="button" onClick={() => setDetails(tx)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className={cn("h-10 w-1 shrink-0 rounded-full", c?.behavior === "red" ? "bg-danger" : c?.behavior === "yellow" ? "bg-warn" : "bg-brand")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-navy">{tx.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {tx.merchant || "—"} · {cat.get(tx.categoryId)?.name ?? "Other"} · {fmtDate(tx.occurredAt, tz, "d MMM, HH:mm")}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">{c && <BehaviorBadge behavior={c.behavior} overridden={c.overridden} />}</span>
                </span>
                <span className="hidden flex-col items-end gap-1 sm:flex">
                  {c && <BehaviorBadge behavior={c.behavior} overridden={c.overridden} />}
                  <span className="flex gap-1">
                    {!tx.planned && tx.type === "expense" && <Badge tone="gray">Unplanned</Badge>}
                    <Badge tone="gray">{PAYMENT_METHOD_LABELS[tx.paymentMethod].replace(" (MoMo)", "")}</Badge>
                  </span>
                </span>
                <span className={cn("money w-24 shrink-0 text-right text-sm font-semibold sm:w-32", income ? "text-brand-dark" : tx.type === "savings_transfer" ? "text-navy-soft" : "text-navy")}>
                  {income ? "+" : "−"}
                  {formatMoney(tx.amount, currency).replace("−", "")}
                </span>
              </button>
              {deleted ? (
                canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => void run((api) => restoreTransaction(api, tx), "Transaction restored.")}>
                    <RotateCcw /> Restore
                  </Button>
                )
              ) : (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button className="rounded-md p-1.5 text-muted hover:bg-slate-100" aria-label={`Actions for ${tx.title}`}>
                      <MoreVertical className="size-4" />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content align="end" className="z-50 min-w-52 rounded-xl border border-line bg-white p-1 shadow-xl">
                      <Item onSelect={() => setDetails(tx)} icon={History}>Details & history</Item>
                      {canEdit && (tx.type === "expense" || tx.type === "income") && <Item onSelect={() => setEditing(tx)} icon={Pencil}>Edit / correct</Item>}
                      {canEdit && tx.type === "expense" && (
                        <>
                          <DropdownMenu.Separator className="my-1 h-px bg-line" />
                          <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">Classification</p>
                          <Item onSelect={() => void setBehavior(tx, "green")} icon={Tag}>Mark healthy</Item>
                          <Item onSelect={() => void setBehavior(tx, "yellow")} icon={Tag}>Mark caution</Item>
                          <Item onSelect={() => void setBehavior(tx, "red")} icon={Tag}>Mark critical</Item>
                          {tx.behaviorOverride && <Item onSelect={() => void setBehavior(tx, null)} icon={RotateCcw}>Use automatic</Item>}
                        </>
                      )}
                      {canEdit && (
                        <>
                          <DropdownMenu.Separator className="my-1 h-px bg-line" />
                          <Item onSelect={() => setRemoving(tx)} icon={Trash2} danger>Delete</Item>
                        </>
                      )}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title="Edit transaction" description="Changes are kept in the audit trail." wide>
          {editing && <TransactionForm initial={editing} tz={tz} currency={currency} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent title={details?.title ?? "Transaction"} wide>
          {details && <TransactionDetails tx={details} classification={classifications.get(details.id)} category={cat.get(details.categoryId)} tz={tz} currency={currency} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Delete this transaction?"
        description={removing && removing.type !== "expense" && removing.type !== "income" ? "This savings movement will be undone: the money returns to where it was. You can restore it from “Recently deleted”." : "It will be removed from your totals. You can restore it from “Recently deleted”, and the deletion is recorded in the audit log."}
        confirmLabel="Delete"
        danger
        loading={pending}
        onConfirm={async () => {
          await run((api) => removeTransaction(api, removing!), "Transaction deleted.");
          setRemoving(null);
        }}
      />
    </>
  );
}

function Item({ children, onSelect, icon: Icon, danger }: { children: React.ReactNode; onSelect: () => void; icon: React.ElementType; danger?: boolean }) {
  return (
    <DropdownMenu.Item onSelect={onSelect} className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-slate-50", danger && "text-danger data-[highlighted]:bg-danger-light/50")}>
      <Icon className="size-4" /> {children}
    </DropdownMenu.Item>
  );
}

function TransactionDetails({ tx, classification, category, tz, currency }: { tx: Transaction; classification?: Classification; category?: TransactionCategory; tz: string; currency: string }) {
  const s = useSession();
  const audit = useList("auditLogs");
  const history = (audit.data ?? []).filter((a) => a.entityId === tx.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rows: [string, React.ReactNode][] = [
    ["Amount", <span key="a" className="money font-semibold">{formatMoney(tx.amount, currency)}</span>],
    ["Type", tx.type.replace("_", " ")],
    ["Date", fmtDate(tx.occurredAt, tz, "EEEE d MMMM yyyy, HH:mm")],
    ["Category", category?.name ?? "—"],
    ["Merchant / payee", tx.merchant || "—"],
    ["Payment method", PAYMENT_METHOD_LABELS[tx.paymentMethod]],
    ["Essential", tx.essential ? "Yes" : "No"],
    ["Planned", tx.planned ? "Yes" : "No"],
    ["Recorded via", SOURCE_LABEL[tx.source]],
  ];
  if (tx.reference) rows.push(["Reference", tx.reference]);
  if (tx.recordedBalance != null) rows.push(["Balance on receipt", formatMoney(tx.recordedBalance, currency)]);
  if (tx.notes) rows.push(["Notes", tx.notes]);
  return (
    <div className="space-y-5">
      {classification && (
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="flex items-center gap-2"><BehaviorBadge behavior={classification.behavior} overridden={classification.overridden} /><span className="text-xs text-muted">Why:</span></div>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-navy">{classification.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
      <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="capitalize-first">{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Audit trail</p>
        {!s.can("manage_members") ? (
          <p className="text-xs text-muted">Only the household owner can view the audit trail.</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-muted">Created {fmtDate(tx.createdAt, tz, "d MMM yyyy, HH:mm")}. No changes since.</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {history.map((h) => (
              <li key={h.id} className="rounded-lg border border-line p-2">
                <p className="font-medium capitalize text-navy">{h.action} · {fmtDate(h.createdAt, tz, "d MMM yyyy, HH:mm")}{h.note ? ` — ${h.note}` : ""}</p>
                {h.changes && (
                  <ul className="mt-1 text-muted">
                    {Object.entries(h.changes).map(([field, ch]) => (
                      <li key={field}>{field}: <span className="line-through">{String(ch.from ?? "—")}</span> → <span className="text-navy">{String(ch.to ?? "—")}</span></li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
