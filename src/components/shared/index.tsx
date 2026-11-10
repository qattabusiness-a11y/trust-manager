"use client";

import { AlertTriangle, Info, Lock, RefreshCw } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge, Skeleton, type Tone } from "@/components/ui/misc";
import type { SpendingStatus } from "@/lib/calculations/budget";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { Behavior, Severity } from "@/types";

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-medium uppercase tracking-wider text-brand-dark">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-navy">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon = Info, title, description, action }: { icon?: React.ElementType; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-white/60 px-6 py-10 text-center">
      <div className="rounded-full bg-brand-light p-3 text-brand-dark">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-navy">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function LoadingState({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger/30 bg-danger-light/50 p-6 text-center" role="alert">
      <AlertTriangle className="size-6 text-danger" />
      <p className="text-sm font-medium text-navy">Something went wrong loading this page.</p>
      <p className="text-xs text-muted">{error instanceof Error ? error.message : "Please try again."}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw /> Retry
        </Button>
      )}
    </div>
  );
}

export function NoAccess({ what }: { what: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-white p-8 text-center">
      <Lock className="size-6 text-muted" />
      <p className="text-sm font-semibold text-navy">You don&apos;t have access to {what}</p>
      <p className="max-w-sm text-xs text-muted">The household owner controls who can see this. Ask them to update your permissions in Household Members.</p>
    </div>
  );
}

export const BEHAVIOR_TONE: Record<Behavior, Tone> = { green: "green", yellow: "yellow", red: "red" };
const BEHAVIOR_LABEL: Record<Behavior, string> = { green: "Healthy", yellow: "Caution", red: "Critical" };

export function BehaviorBadge({ behavior, overridden }: { behavior: Behavior; overridden?: boolean }) {
  return (
    <Badge tone={BEHAVIOR_TONE[behavior]}>
      <span className={cn("size-1.5 rounded-full", behavior === "green" ? "bg-brand" : behavior === "yellow" ? "bg-warn" : "bg-danger")} />
      {BEHAVIOR_LABEL[behavior]}
      {overridden && <span className="opacity-70">· set by you</span>}
    </Badge>
  );
}

export const STATUS_TONE: Record<SpendingStatus, Tone> = { healthy: "green", caution: "yellow", warning: "yellow", critical: "red" };
export const statusBar = (s: SpendingStatus): "green" | "yellow" | "red" => (s === "healthy" ? "green" : s === "critical" ? "red" : "yellow");

export function StatusBadge({ status }: { status: SpendingStatus }) {
  const label = { healthy: "Healthy", caution: "Caution", warning: "Warning", critical: "Critical" }[status];
  return <Badge tone={STATUS_TONE[status]}>{label}</Badge>;
}

export const SEVERITY_STYLES: Record<Severity, { bar: string; bg: string; text: string; tone: Tone }> = {
  info: { bar: "bg-blue-500", bg: "bg-blue-50", text: "text-blue-700", tone: "blue" },
  success: { bar: "bg-brand", bg: "bg-brand-light/60", text: "text-brand-dark", tone: "green" },
  caution: { bar: "bg-warn", bg: "bg-warn-light/60", text: "text-warn-dark", tone: "yellow" },
  warning: { bar: "bg-warn", bg: "bg-warn-light", text: "text-warn-dark", tone: "yellow" },
  critical: { bar: "bg-danger", bg: "bg-danger-light/70", text: "text-danger", tone: "red" },
};

export function DemoDataBadge({ label = "DEMO DATA — Not verified live market prices." }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-warn/40 bg-warn-light px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-warn-dark">
      <AlertTriangle className="size-3.5" /> {label}
    </span>
  );
}

export function SimulatedBadge() {
  return <Badge tone="yellow">Recorded here only — move the money yourself in MoMo or your bank</Badge>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title}>
        <p className="text-sm text-muted">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "default"} loading={loading} onClick={() => void onConfirm()}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Hidden({ children, visible, placeholder }: { children: React.ReactNode; visible: boolean; placeholder?: string }) {
  const t = useT();
  if (visible) return <>{children}</>;
  return (
    <span className="inline-flex items-center gap-1 text-muted" title="You don't have permission to view this">
      <Lock className="size-3.5" /> {placeholder ?? t("common.hidden")}
    </span>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "green" | "yellow" | "red" }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted">{label}</span>
      <span className={cn("money text-lg font-semibold", tone === "green" ? "text-brand-dark" : tone === "yellow" ? "text-warn-dark" : tone === "red" ? "text-danger" : "text-navy")}>{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}
