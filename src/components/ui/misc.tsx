import * as React from "react";
import { cn } from "@/lib/utils";

export type Tone = "green" | "yellow" | "red" | "navy" | "gray" | "blue";

const toneClasses: Record<Tone, string> = {
  green: "bg-brand-light text-brand-dark",
  yellow: "bg-warn-light text-warn-dark",
  red: "bg-danger-light text-danger",
  navy: "bg-navy text-white",
  gray: "bg-slate-100 text-slate-600",
  blue: "bg-blue-50 text-blue-700",
};

export function Badge({ tone = "gray", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", toneClasses[tone], className)} {...props} />;
}

const barTone: Record<"green" | "yellow" | "red", string> = { green: "bg-brand", yellow: "bg-warn", red: "bg-danger" };

export function Progress({ value, tone = "green", className, label }: { value: number; tone?: "green" | "yellow" | "red"; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", barTone[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-200/70", className)} />;
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: React.ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-lg bg-slate-100 p-1", className)}>
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          type="button"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", value === it.value ? "bg-white text-navy shadow-sm" : "text-muted hover:text-navy")}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
