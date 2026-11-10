"use client";

import { formatInTimeZone } from "date-fns-tz";
import { Bot, FileText, ImageIcon, Loader2, Mic, MicOff, Paperclip, Send, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/inputs";
import { CAT, MAX_RECEIPT_BYTES } from "@/constants";
import { useAction } from "@/hooks/use-data";
import { useFinance } from "@/hooks/use-finance";
import { useT } from "@/i18n";
import { guessCategory } from "@/lib/assistant/parse";
import { parseCsvStatement, parseTextStatement } from "@/lib/assistant/statement";
import type { Draft, TransactionDraft } from "@/lib/assistant/types";
import { localDate, todayLocal } from "@/lib/dates";
import { cn, uuid } from "@/lib/utils";
import { answer, applyDraft, assistantProvider, buildContext, draftIsComplete, enrichDrafts, permissionFor } from "@/services/assistant.service";
import { ocrService, ReceiptProcessingError, warmUpOcr } from "@/services/ocr.service";
import { useAssistantStore, type ChatMessage } from "@/stores/assistant.store";
import { useDisplayStore } from "@/stores/display.store";
import { DraftCard } from "./DraftCard";

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

type SpeechRecognitionLike = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export function AssistantWidget() {
  const t = useT();
  const f = useFinance();
  const { run } = useAction();
  const lang = useDisplayStore((s) => s.language);
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const messages = useAssistantStore((s) => s.messages);
  const push = useAssistantStore((s) => s.push);
  const patch = useAssistantStore((s) => s.patch);
  const clear = useAssistantStore((s) => s.clear);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const tz = f.snapshot.tz;
  const currency = f.snapshot.currency;
  const goals = useMemo(() => f.data.savingsGoals.filter((g) => !g.deletedAt && g.status === "active").map((g) => ({ id: g.id, name: g.name })), [f.data.savingsGoals]);
  const speechSupported = typeof window !== "undefined" && !!((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open]);

  useEffect(() => {
    if (open) warmUpOcr();
  }, [open]);

  const say = (text: string, drafts?: Draft[]) => {
    const id = uuid();
    push({ id, role: "assistant", text, drafts, status: drafts ? Object.fromEntries(drafts.map((d) => [d.id, "pending" as const])) : undefined, errors: {} });
    return id;
  };

  async function send(raw: string) {
    const msg = raw.trim();
    if (!msg || thinking) return;
    setText("");
    push({ id: uuid(), role: "user", text: msg });
    setThinking(true);
    try {
      const ctx = buildContext(f.data, tz);
      const result = await assistantProvider.interpret(msg, ctx, lang);
      const drafts = enrichDrafts(result.drafts, f.data, currency);
      const answers = result.questions.map((q) => answer(q, f.snapshot, f.data, f.can, lang));
      if (answers.length) say(answers.join("\n\n"));
      if (drafts.length) {
        // Typed messages are saved straight away when every detail is there;
        // anything incomplete stays as a card to finish.
        const ready = drafts.filter((d) => d.include && draftIsComplete(d) && f.can(permissionFor(d)));
        const id = say(ready.length ? t("ai.savingNow") : drafts.length === 1 ? t("ai.understoodOne") : t("ai.understood"), drafts);
        if (ready.length) {
          await saveAll({ id, role: "assistant", text: "", drafts, status: {} }, ready.length < drafts.length);
        }
      }
      if (!answers.length && !drafts.length) say(t("ai.nothing"));
    } finally {
      setThinking(false);
    }
  }

  async function attach(file: File) {
    if (fileRef.current) fileRef.current.value = "";
    const isImage = /^image\/(png|jpe?g|webp)$/.test(file.type);
    push({ id: uuid(), role: "user", text: "", attachments: [{ name: file.name, kind: isImage ? "image" : "file" }] });
    const ctx = buildContext(f.data, tz);
    const tzDate = (iso: string) => localDate(iso, tz);
    if (isImage) {
      if (file.size > MAX_RECEIPT_BYTES) return say(t("ai.imageFailed", { reason: "larger than 5 MB" }));
      const waitId = say(t("ai.readingImage"));
      patch(waitId, (m) => ({ ...m, busy: true }));
      try {
        const r = await ocrService.process(file);
        const x = r.extraction;
        const income = x.direction === "income";
        const today = todayLocal(tz);
        const draft: TransactionDraft = {
          id: uuid(),
          kind: "transaction",
          type: income ? "income" : "expense",
          source: file.name,
          missing: x.amount == null ? ["amount"] : [],
          include: true,
          title: x.merchant ? `${income ? "Received from" : "Payment to"} ${x.merchant}` : income ? "Money received" : "Receipt payment",
          amount: x.amount,
          date: x.localDate && x.localDate <= today ? x.localDate : today,
          time: x.localTime ?? formatInTimeZone(new Date(), tz, "HH:mm"),
          categoryId: income ? CAT.incomeOther : guessCategory(x.merchant ?? ""),
          merchant: x.merchant ?? "",
          paymentMethod: (["momo", "bank", "card", "cash"].includes(x.paymentMethod ?? "") ? x.paymentMethod : "momo") as TransactionDraft["paymentMethod"],
          essential: true,
          planned: true,
          reference: x.transactionReference,
          recordedBalance: x.remainingBalance,
          note: `${Math.round(x.confidence * 100)}% confidence · image not stored`,
        };
        patch(waitId, (m) => ({ ...m, busy: false, text: t("ai.imageRead"), drafts: [draft], status: { [draft.id]: "pending" }, errors: {} }));
      } catch (e) {
        const reason = e instanceof ReceiptProcessingError ? e.message : "please try a clearer image";
        patch(waitId, (m) => ({ ...m, busy: false, text: t("ai.imageFailed", { reason }) }));
      }
      return;
    }
    const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
    const isTxt = /\.txt$/i.test(file.name) || file.type === "text/plain";
    if ((!isCsv && !isTxt) || file.size > MAX_TEXT_FILE_BYTES) return say(t("ai.fileUnsupported"));
    const content = await file.text();
    const drafts = isCsv ? parseCsvStatement(content, ctx, f.data.transactions, tzDate) : parseTextStatement(content, ctx, f.data.transactions, tzDate);
    if (!drafts.length) {
      // A TXT note can also be plain sentences ("spent 2000 on moto…").
      if (isTxt) return send(content.slice(0, 4000));
      return say(t("ai.fileNone", { file: file.name }));
    }
    say(t("ai.fileRows", { n: drafts.length, file: file.name }), drafts);
  }

  function updateDraft(msgId: string, d: Draft) {
    patch(msgId, (m) => ({ ...m, drafts: m.drafts?.map((x) => (x.id === d.id ? d : x)) }));
  }

  async function saveAll(m: ChatMessage, someLeft = false) {
    const targets = (m.drafts ?? []).filter((d) => d.include && m.status?.[d.id] !== "saved" && f.can(permissionFor(d)) && draftIsComplete(d));
    if (!targets.length) return;
    patch(m.id, (x) => ({ ...x, status: { ...x.status, ...Object.fromEntries(targets.map((d) => [d.id, "saving" as const])) } }));
    let ok = 0;
    let failed = 0;
    await run(async (api) => {
      for (const d of targets) {
        try {
          await applyDraft(api, d, { tz, currency, data: f.data, recorderName: f.profile?.fullName ?? "household" });
          ok++;
          patch(m.id, (x) => ({ ...x, status: { ...x.status, [d.id]: "saved" } }));
        } catch (e) {
          failed++;
          patch(m.id, (x) => ({ ...x, status: { ...x.status, [d.id]: "error" }, errors: { ...x.errors, [d.id]: (e as Error).message } }));
        }
      }
    });
    say(failed ? t("ai.someFailed", { ok, failed }) : someLeft ? t("ai.needMore") : `${t("ai.savedAll", { n: ok })} ${t("ai.undoHint")}`);
  }

  function toggleVoice() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang === "rw" ? "rw-RW" : "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const said = Array.from(e.results).map((r) => r[0]?.transcript ?? "").join(" ");
      setText((cur) => (cur ? `${cur} ${said}` : said));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  const examples = [t("ai.example1"), t("ai.example2"), t("ai.example3"), t("ai.example4")];

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("ai.open")}
          className="fixed bottom-20 right-4 z-40 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-dark text-white shadow-lg shadow-brand/30 ring-4 ring-white transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-brand/40 lg:bottom-6 lg:right-6"
        >
          <Sparkles className="size-6" />
          <span className="absolute -right-1 -top-1 rounded-full bg-navy px-1.5 py-0.5 text-[9px] font-bold tracking-wide">AI</span>
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label={t("ai.title")}
          className="fixed inset-0 z-50 flex flex-col bg-canvas shadow-2xl sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(680px,calc(100dvh-3rem))] sm:w-[420px] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-line"
        >
          <header className="flex items-center gap-3 bg-navy px-4 py-3 text-white">
            <span className="flex size-9 items-center justify-center rounded-full bg-brand"><Bot className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t("ai.title")}</p>
              <p className="truncate text-[11px] text-white/70">{t("ai.subtitle")}</p>
            </div>
            {messages.length > 0 && (
              <button type="button" onClick={clear} className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label={t("ai.clear")} title={t("ai.clear")}>
                <Trash2 className="size-4" />
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label={t("common.close")}>
              <X className="size-5" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4" aria-live="polite">
            <Bubble role="assistant">
              <p>{t("ai.welcome")}</p>
              <p className="mt-2 text-[11px] font-semibold text-muted">{t("ai.try")}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {examples.map((ex) => (
                  <button key={ex} type="button" onClick={() => void send(ex)} className="rounded-full border border-brand/30 bg-white px-2.5 py-1 text-left text-[11px] text-brand-dark hover:bg-brand-light">
                    {ex}
                  </button>
                ))}
              </div>
            </Bubble>

            {messages.map((m) => (
              <Bubble key={m.id} role={m.role}>
                {m.attachments?.map((a) => (
                  <p key={a.name} className="flex items-center gap-1.5 font-medium">
                    {a.kind === "image" ? <ImageIcon className="size-4" /> : <FileText className="size-4" />} {a.name}
                  </p>
                ))}
                {m.text && <p className="whitespace-pre-line">{m.text}</p>}
                {m.busy && <Loader2 className="mt-1 size-4 animate-spin" />}
                {m.drafts && m.drafts.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {m.drafts.map((d) => (
                      <DraftCard
                        key={d.id}
                        draft={d}
                        status={m.status?.[d.id] ?? "pending"}
                        error={m.errors?.[d.id]}
                        categories={f.data.categories}
                        goals={goals}
                        currency={currency}
                        allowed={f.can(permissionFor(d))}
                        onChange={(nd) => updateDraft(m.id, nd)}
                        onToggle={() => updateDraft(m.id, { ...d, include: !d.include })}
                      />
                    ))}
                    <SaveBar m={m} canSave={(d) => f.can(permissionFor(d))} onSave={() => void saveAll(m)} />
                  </div>
                )}
              </Bubble>
            ))}
            {thinking && (
              <Bubble role="assistant">
                <Loader2 className="size-4 animate-spin" />
              </Bubble>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="border-t border-line bg-white p-2 pb-safe"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <div className="flex items-end gap-1.5">
              <button type="button" onClick={() => fileRef.current?.click()} className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-slate-100 hover:text-navy" aria-label={t("ai.attach")} title={t("ai.attach")}>
                <Paperclip className="size-5" />
              </button>
              {speechSupported && (
                <button type="button" onClick={toggleVoice} className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100", listening ? "text-danger" : "text-muted hover:text-navy")} aria-label={listening ? t("ai.listening") : t("ai.voice")} title={listening ? t("ai.listening") : t("ai.voice")}>
                  {listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                </button>
              )}
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(text);
                  }
                }}
                rows={1}
                placeholder={listening ? t("ai.listening") : t("ai.placeholder")}
                className="max-h-32 min-h-10 resize-none py-2.5 text-sm"
                aria-label={t("ai.placeholder")}
              />
              <Button type="submit" size="icon" disabled={!text.trim() || thinking} aria-label={t("ai.send")}>
                <Send />
              </Button>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,.csv,text/csv,.txt,text/plain" className="sr-only" onChange={(e) => e.target.files?.[0] && void attach(e.target.files[0])} />
            <p className="mt-1.5 flex items-center justify-center gap-1 text-[10px] text-muted">
              <ShieldCheck className="size-3" /> {t("ai.privacy")}
            </p>
          </form>
        </section>
      )}
    </>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  return (
    <div className={cn("flex", role === "user" ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed", role === "user" ? "rounded-br-md bg-brand text-white" : "rounded-bl-md border border-line bg-white text-navy")}>{children}</div>
    </div>
  );
}

function SaveBar({ m, canSave, onSave }: { m: ChatMessage; canSave: (d: Draft) => boolean; onSave: () => void }) {
  const t = useT();
  const drafts = m.drafts ?? [];
  const ready = drafts.filter((d) => d.include && m.status?.[d.id] !== "saved" && canSave(d) && draftIsComplete(d));
  const saving = drafts.some((d) => m.status?.[d.id] === "saving");
  const allSaved = drafts.filter((d) => d.include).every((d) => m.status?.[d.id] === "saved");
  if (allSaved && drafts.some((d) => m.status?.[d.id] === "saved")) return null;
  return (
    <Button type="button" className="w-full" size="sm" disabled={!ready.length || saving} loading={saving} onClick={onSave}>
      {saving ? t("ai.saving") : t("ai.saveAll", { n: ready.length })}
    </Button>
  );
}
