"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";

export function MobileNavigation() {
  const pathname = usePathname();
  const { can } = useSession();
  const [more, setMore] = useState(false);
  const visible = NAV.filter((n) => !n.permission || can(n.permission));
  const primary = visible.filter((n) => n.mobile).slice(0, 4);
  const secondary = visible.filter((n) => !primary.includes(n));

  return (
    <>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur lg:hidden" aria-label="Main">
        <ul className="grid grid-cols-5">
          {primary.map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px]", active ? "text-brand-dark" : "text-muted")}>
                  <n.icon className="size-5" />
                  {n.short ?? n.label.split(" ")[0]}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setMore(true)} className="flex w-full flex-col items-center gap-0.5 py-2 text-[10px] text-muted">
              <MoreHorizontal className="size-5" /> More
            </button>
          </li>
        </ul>
      </nav>
      <Dialog open={more} onOpenChange={setMore}>
        <DialogContent title="More">
          <ul className="grid grid-cols-3 gap-2">
            {secondary.map((n) => (
              <li key={n.href}>
                <Link href={n.href} onClick={() => setMore(false)} className={cn("flex flex-col items-center gap-2 rounded-xl border border-line p-3 text-center text-xs", pathname.startsWith(n.href) ? "border-brand bg-brand-light text-brand-dark" : "text-navy")}>
                  <n.icon className="size-5" />
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
