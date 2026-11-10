"use client";

import { CheckCircle2, Circle, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export interface Step {
  id: string;
  label: string;
  hint: string;
  done: boolean;
  href?: string;
  onClick?: () => void;
}

const KEY = "tm:getting-started-dismissed";

/** A short checklist that walks a new household through its first week. */
export function GettingStarted({ steps, householdId }: { steps: Step[]; householdId: string }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(KEY) === householdId;
    } catch {
      return false;
    }
  });
  const done = steps.filter((s) => s.done).length;
  if (dismissed || done === steps.length) return null;
  const next = steps.find((s) => !s.done);

  return (
    <Card className="mb-6 border-brand/30 bg-brand-light/20 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Get the most from Trust Manager</p>
          <p className="text-xs text-muted">{done} of {steps.length} done{next ? ` · next: ${next.label.toLowerCase()}` : ""}</p>
        </div>
        <button
          className="rounded-md p-1 text-muted hover:bg-white hover:text-navy"
          aria-label="Hide this checklist"
          onClick={() => {
            try {
              window.localStorage.setItem(KEY, householdId);
            } catch {
              /* private mode */
            }
            setDismissed(true);
          }}
        >
          <X className="size-4" />
        </button>
      </div>
      <Progress value={(done / steps.length) * 100} className="mt-3" label="Setup progress" />
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {steps.map((s) => {
          const body = (
            <span className={cn("flex h-full items-start gap-2.5 rounded-xl border bg-white p-3 text-left transition-colors", s.done ? "border-line opacity-70" : "border-line hover:border-brand")}>
              {s.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" /> : <Circle className="mt-0.5 size-4 shrink-0 text-slate-300" />}
              <span>
                <span className={cn("block text-sm font-medium", s.done && "line-through")}>{s.label}</span>
                <span className="block text-xs text-muted">{s.hint}</span>
              </span>
            </span>
          );
          return (
            <li key={s.id}>
              {s.done ? body : s.href ? <Link href={s.href} className="block h-full">{body}</Link> : <button type="button" className="block h-full w-full" onClick={s.onClick}>{body}</button>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
