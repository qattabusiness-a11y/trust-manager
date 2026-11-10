"use client";

import { ArrowRight, Bell } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, SEVERITY_STYLES } from "@/components/shared";
import type { Alert } from "@/lib/calculations/snapshot";
import { cn } from "@/lib/utils";

export function AlertsPanel({ alerts }: { alerts: Alert[] }) {
  const order = { critical: 0, warning: 1, caution: 2, info: 3, success: 4 };
  const sorted = [...alerts].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>What needs your attention</CardTitle>
        <span className="text-xs text-muted">{alerts.length} alert{alerts.length === 1 ? "" : "s"}</span>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <EmptyState icon={Bell} title="Nothing to worry about right now" description="We'll warn you before small problems become big ones." />
        ) : (
          <ul className="space-y-2.5">
            {sorted.map((a) => {
              const st = SEVERITY_STYLES[a.severity];
              return (
                <li key={a.id} className={cn("relative overflow-hidden rounded-xl p-3.5 pl-5", st.bg)}>
                  <span className={cn("absolute inset-y-0 left-0 w-1", st.bar)} />
                  <p className="text-sm font-medium text-navy">{a.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{a.explanation}</p>
                  {a.action && (
                    <Link href={a.action.href} className={cn("mt-2 inline-flex items-center gap-1 text-xs font-semibold hover:underline", st.text)}>
                      {a.action.label} <ArrowRight className="size-3" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
