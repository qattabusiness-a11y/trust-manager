"use client";

import { formatInTimeZone } from "date-fns-tz";
import { CheckCircle2, ImageUp, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { CAT, RECEIPT_MIME_TYPES } from "@/constants";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ocrService, ReceiptProcessingError, validateReceiptFile } from "@/services/ocr.service";
import type { PaymentMethod, ReceiptProcessingResult } from "@/types";
import { TransactionForm } from "@/components/transactions/TransactionForm";

type Stage =
  | { kind: "idle" }
  | { kind: "processing"; previewUrl: string; name: string }
  | { kind: "review"; result: ReceiptProcessingResult }
  | { kind: "error"; message: string; cleanupVerified: boolean };

const METHOD: Record<string, PaymentMethod> = { momo: "momo", bank: "bank", card: "card", cash: "cash" };

/**
 * Ephemeral receipt workflow:
 * upload → validate → process in memory on our server → user confirms/corrects
 * → only the structured transaction is saved. The image is never persisted;
 * the local preview URL is revoked as soon as processing ends.
 */
export function ReceiptUpload({ tz, currency, balance, onDone }: { tz: string; currency: string; balance?: number; onDone: () => void }) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);

  const releasePreview = useCallback(() => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  useEffect(() => releasePreview, [releasePreview]);

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
    setStage({ kind: "processing", previewUrl: url, name: file.name });
    try {
      const result = await ocrService.process(file);
      if (!result.cleanup.verified) {
        toast.warning("The temporary image deletion could not be verified. A cleanup has been triggered and the image will expire within 60 seconds.");
      }
      setStage({ kind: "review", result });
    } catch (e) {
      const pe = e as ReceiptProcessingError;
      setStage({ kind: "error", message: pe.message, cleanupVerified: pe.cleanupVerified ?? true });
    } finally {
      // The image leaves the browser's memory as soon as processing ends.
      releasePreview();
    }
  }

  if (stage.kind === "review") {
    const x = stage.result.extraction;
    const when = x.transactionDate ? new Date(x.transactionDate) : new Date();
    const low = x.confidence < 0.75;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand-light/50 p-3 text-xs text-brand-dark">
          <ShieldCheck className="size-4" />
          <span className="font-medium">Original image deleted{stage.result.cleanup.verified ? " — deletion verified." : " — verification pending, cleanup triggered."}</span>
          <span className="text-brand-dark/70">Only the details below will be saved.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone={low ? "yellow" : "green"}>Confidence {Math.round(x.confidence * 100)}%</Badge>
          <Badge tone="gray">{stage.result.processor}</Badge>
          {x.transactionReference && <Badge tone="gray">Ref {x.transactionReference}</Badge>}
          {low && <span className="text-warn-dark">Some fields may be wrong — please check them.</span>}
        </div>
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
          defaults={{
            type: "expense",
            title: x.merchant ? `Payment to ${x.merchant.split("—")[0]!.trim()}` : "Receipt payment",
            amount: x.amount ?? (undefined as unknown as number),
            date: formatInTimeZone(when, tz, "yyyy-MM-dd"),
            time: formatInTimeZone(when, tz, "HH:mm"),
            merchant: x.merchant ?? "",
            paymentMethod: METHOD[x.paymentMethod ?? ""] ?? "momo",
            categoryId: /simba|market/i.test(x.merchant ?? "") ? CAT.groceries : /reg|cash power/i.test(x.merchant ?? "") ? CAT.utilities : /pharm/i.test(x.merchant ?? "") ? CAT.health : /landlord/i.test(x.merchant ?? "") ? CAT.rent : /librairie/i.test(x.merchant ?? "") ? CAT.education : "",
            reference: x.transactionReference,
            recordedBalance: x.remainingBalance,
          }}
          onDone={() => {
            toast.success("Receipt processed. Transaction saved; the image was not kept.");
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
          {/* Temporary preview: an in-memory object URL, revoked right after processing. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={stage.previewUrl} alt="Receipt being processed" className="max-h-56 rounded-lg object-contain opacity-80 blur-[1px]" />
          <p className="flex items-center gap-2 text-sm text-navy"><Loader2 className="size-4 animate-spin" /> Reading your receipt…</p>
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
            <p className="mt-1 text-xs text-muted">MoMo receipts, bank transfers, invoices · PNG, JPG, WEBP · up to 5 MB</p>
          </div>
          <input ref={inputRef} type="file" accept={RECEIPT_MIME_TYPES.join(",")} className="sr-only" onChange={(e) => void handle(e.target.files?.[0])} />
        </label>
      )}

      {stage.kind === "error" && (
        <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-light/60 p-3 text-sm" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="flex-1">
            <p className="font-medium text-navy">{stage.message}</p>
            <p className="mt-0.5 text-xs text-muted">
              {stage.cleanupVerified ? "The image was not kept." : "We couldn't confirm the temporary image was deleted; an automatic cleanup removes it within 60 seconds."}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setStage({ kind: "idle" })}>Try again</Button>
        </div>
      )}

      <ul className="space-y-1.5 text-xs text-muted">
        <li className="flex gap-2"><CheckCircle2 className="size-3.5 shrink-0 text-brand" /> The image is processed in memory on Trust Manager&apos;s server and deleted immediately — never stored.</li>
        <li className="flex gap-2"><CheckCircle2 className="size-3.5 shrink-0 text-brand" /> You review and correct every field before anything is saved.</li>
        <li className="flex gap-2"><CheckCircle2 className="size-3.5 shrink-0 text-brand" /> Receipts are never sent to outside AI services without your consent. Development mode uses a mock reader.</li>
      </ul>
    </div>
  );
}
