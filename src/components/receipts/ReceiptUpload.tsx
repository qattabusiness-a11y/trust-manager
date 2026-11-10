"use client";

import { formatInTimeZone } from "date-fns-tz";
import { CheckCircle2, ImageUp, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Progress } from "@/components/ui/misc";
import { CAT, RECEIPT_MIME_TYPES } from "@/constants";
import { todayLocal } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ocrService, ReceiptProcessingError, validateReceiptFile, warmUpOcr } from "@/services/ocr.service";
import type { PaymentMethod, ReceiptProcessingResult } from "@/types";
import { TransactionForm } from "@/components/transactions/TransactionForm";

type Stage =
  | { kind: "idle" }
  | { kind: "processing"; previewUrl: string; name: string }
  | { kind: "review"; result: ReceiptProcessingResult }
  | { kind: "error"; message: string; cleanupVerified: boolean };

const METHOD: Record<string, PaymentMethod> = { momo: "momo", bank: "bank", card: "card", cash: "cash" };

function guessCategory(merchant: string | null, income: boolean): string {
  const m = merchant ?? "";
  if (income) return CAT.incomeOther;
  if (/simba|sawa|market|supermarket|boucherie|alimentation|shop|mart/i.test(m)) return CAT.groceries;
  if (/\breg\b|cash ?power|wasac|electric|water/i.test(m)) return CAT.utilities;
  if (/pharm|clinic|hospital|polyclin/i.test(m)) return CAT.health;
  if (/landlord|rent|housing/i.test(m)) return CAT.rent;
  if (/school|college|universit|librair|academy/i.test(m)) return CAT.education;
  if (/mtn|airtel|canal|liquid|internet|data/i.test(m)) return CAT.communication;
  if (/moto|yego|taxi|bus|fuel|station|\bsp\b|engen/i.test(m)) return CAT.transport;
  if (/restaurant|caf[eé]|coffee|bar|lounge|pizza|brioche/i.test(m)) return CAT.dining;
  return "";
}

/**
 * Ephemeral receipt workflow, entirely on the device:
 * choose image → validate → read with the on-device OCR engine → user
 * confirms/corrects → only the structured transaction is saved.
 * The image is never uploaded or stored; the preview URL is revoked and the
 * OCR worker terminated as soon as reading ends.
 */
export function ReceiptUpload({ tz, currency, balance, onDone }: { tz: string; currency: string; balance?: number; onDone: () => void }) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [progress, setProgress] = useState(0);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);

  const releasePreview = useCallback(() => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  useEffect(() => releasePreview, [releasePreview]);
  // Begin fetching the reader while the person picks a photo.
  useEffect(() => warmUpOcr(), []);

  async function handle(file: File | undefined) {
    if (!file) return;
    const err = validateReceiptFile(file);
    if (err) {
      if (inputRef.current) inputRef.current.value = "";
      setStage({ kind: "error", message: err, cleanupVerified: true });
      return;
    }
    releasePreview();
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setProgress(0);
    setStage({ kind: "processing", previewUrl: url, name: file.name });
    try {
      const result = await ocrService.process(file, { onProgress: setProgress });
      if (!result.cleanup.verified) toast.warning("The image could not be confirmed as released from memory. Close this tab to be sure.");
      setStage({ kind: "review", result });
    } catch (e) {
      const pe = e as ReceiptProcessingError;
      setStage({ kind: "error", message: pe.message || "We couldn't read this receipt.", cleanupVerified: pe.cleanupVerified ?? true });
    } finally {
      // The image leaves the browser's memory as soon as reading ends.
      releasePreview();
    }
  }

  if (stage.kind === "review") {
    const x = stage.result.extraction;
    const income = x.direction === "income";
    const low = x.confidence < 0.75;
    const missing = [x.amount == null && "amount", !x.merchant && (income ? "sender" : "merchant"), !x.localDate && "date"].filter(Boolean) as string[];
    const now = new Date();
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand-light/50 p-3 text-xs text-brand-dark">
          <ShieldCheck className="size-4" />
          <span className="font-medium">Read on your device — the image was never uploaded{stage.result.cleanup.verified ? " and has been released from memory (verified)." : "."}</span>
          <span className="text-brand-dark/70">Only the details below will be saved.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone={low ? "yellow" : "green"}>Confidence {Math.round(x.confidence * 100)}%</Badge>
          {x.transactionReference && <Badge tone="gray">Ref {x.transactionReference}</Badge>}
          {x.fee ? <Badge tone="gray">Fee {formatMoney(x.fee, currency)}</Badge> : null}
          {income && <Badge tone="green">Money received</Badge>}
        </div>
        {(missing.length > 0 || low) && (
          <p className="rounded-lg bg-warn-light/70 p-3 text-xs text-warn-dark">
            {missing.length > 0 ? `We couldn't find the ${missing.join(", ")} on this receipt — please fill ${missing.length > 1 ? "them" : "it"} in. ` : ""}
            Check every field before saving; reading isn&apos;t always perfect.
          </p>
        )}
        {x.remainingBalance != null && balance != null && (
          <p className="rounded-lg bg-slate-50 p-3 text-xs text-muted">
            Balance shown on the receipt: <strong className="money text-navy">{formatMoney(x.remainingBalance, currency)}</strong> · Trust Manager recorded balance:{" "}
            <strong className="money text-navy">{formatMoney(balance, currency)}</strong>. Differences usually mean some transactions haven&apos;t been recorded yet.
          </p>
        )}
        <TransactionForm
          tz={tz}
          currency={currency}
          source="receipt_ocr"
          lockType
          defaults={{
            type: income ? "income" : "expense",
            title: x.merchant ? `${income ? "Received from" : "Payment to"} ${x.merchant}` : income ? "Money received" : "Receipt payment",
            amount: x.amount ?? (undefined as unknown as number),
            date: x.localDate && x.localDate <= todayLocal(tz) ? x.localDate : todayLocal(tz),
            time: x.localTime ?? formatInTimeZone(now, tz, "HH:mm"),
            merchant: x.merchant ?? "",
            paymentMethod: METHOD[x.paymentMethod ?? ""] ?? "momo",
            categoryId: guessCategory(x.merchant, income),
            reference: x.transactionReference,
            recordedBalance: x.remainingBalance,
          }}
          onDone={() => {
            toast.success("Transaction saved. The receipt image was not kept.");
            onDone();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stage.kind === "processing" ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-slate-50 p-6">
          {/* Temporary preview: an in-memory object URL, revoked right after reading. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={stage.previewUrl} alt="Receipt being read" className="max-h-56 rounded-lg object-contain opacity-80 blur-[1px]" />
          <p className="flex items-center gap-2 text-sm text-navy"><Loader2 className="size-4 animate-spin" /> Reading your receipt on this device…</p>
          <Progress value={Math.max(5, progress * 100)} className="max-w-xs" label="Reading progress" />
          <p className="text-xs text-muted">The first receipt takes a little longer while the reader loads.</p>
        </div>
      ) : (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void handle(e.dataTransfer.files?.[0]);
          }}
          className={cn("flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors", drag ? "border-brand bg-brand-light/50" : "border-line hover:border-brand/60 hover:bg-slate-50")}
        >
          <div className="rounded-full bg-brand-light p-3 text-brand-dark"><ImageUp className="size-6" /></div>
          <div>
            <p className="text-sm font-semibold text-navy">Drop a receipt screenshot here, or tap to choose</p>
            <p className="mt-1 text-xs text-muted">MoMo messages, bank transfers, invoices · PNG, JPG, WEBP · up to 5 MB</p>
          </div>
          <input ref={inputRef} type="file" accept={RECEIPT_MIME_TYPES.join(",")} className="sr-only" onChange={(e) => void handle(e.target.files?.[0])} />
        </label>
      )}

      {stage.kind === "error" && (
        <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-light/60 p-3 text-sm" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="flex-1">
            <p className="font-medium text-navy">{stage.message}</p>
            <p className="mt-0.5 text-xs text-muted">{stage.cleanupVerified ? "The image was not kept." : "We couldn't confirm the image was released from memory. Close this tab to be sure."}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setStage({ kind: "idle" })}>Try again</Button>
        </div>
      )}

      <ul className="space-y-1.5 text-xs text-muted">
        <li className="flex gap-2"><CheckCircle2 className="size-3.5 shrink-0 text-brand" /> Your receipt is read on this device. The image is never uploaded and never stored.</li>
        <li className="flex gap-2"><CheckCircle2 className="size-3.5 shrink-0 text-brand" /> You review and correct every field before anything is saved.</li>
        <li className="flex gap-2"><CheckCircle2 className="size-3.5 shrink-0 text-brand" /> Clear screenshots of MoMo or bank messages work best.</li>
      </ul>
    </div>
  );
}
