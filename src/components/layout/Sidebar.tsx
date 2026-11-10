"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Progress } from "@/components/ui/misc";
import { statusBar } from "@/components/shared";
import { useFinance } from "@/hooks/use-finance";
import { cn, initials, pct } from "@/lib/utils";
import { Logo } from "./Logo";
import { NAV } from "./nav";

export function Sidebar({ unread }: { unread: number }) {
  const pathname = usePathname();
  const f = useFinance();
  const visible = NAV.filter((n) => !n.permission || f.can(n.permission));
  const target = f.budget?.savingsTarget ?? 0;
  const savingsPct = pct(f.snapshot.savingsThisMonth, target);

  return (
    <aside className="sidebar-texture sticky top-0 hidden h-dvh w-64 shrink-0 flex-col text-white lg:flex">
      <div className="px-5 pb-4 pt-5">
        <Logo dark />
      </div>

      <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-brand text-xs font-semibold">{initials(f.profile?.fullName ?? "?")}</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{f.profile?.fullName}</p>
          <p className="truncate text-xs text-white/60">{f.household?.name ?? "Household"}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3" aria-label="Main">
        <ul className="space-y-0.5">
          {visible.map((n) => {
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active ? "bg-white text-navy font-medium shadow-sm" : "text-white/75 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <n.icon className={cn("size-4", active ? "text-brand" : "")} />
                  <span className="flex-1">{n.label}</span>
                  {n.href === "/overview" && unread > 0 && <span className="rounded-full bg-danger px-1.5 text-[10px] font-semibold text-white">{unread}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-4 border-t border-white/10 p-4">
        {f.snapshot.budget && f.can("view_budget") && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-white/70">Monthly budget</span>
              <span className="font-medium">{Math.round(f.snapshot.budget.month.usedPct)}% used</span>
            </div>
            <Progress value={f.snapshot.budget.month.usedPct} tone={statusBar(f.snapshot.budget.month.status)} className="bg-white/10" label="Monthly budget used" />
          </div>
        )}
        {f.can("view_balances") && target > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-white/70">Savings this month</span>
              <span className="font-medium">{Math.min(999, Math.round(savingsPct))}%</span>
            </div>
            <Progress value={savingsPct} className="bg-white/10" label="Savings target progress" />
          </div>
        )}
      </div>
    </aside>
  );
}
