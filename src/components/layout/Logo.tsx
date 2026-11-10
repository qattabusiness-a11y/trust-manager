import Image from "next/image";
import { cn } from "@/lib/utils";

/** Trust Manager emblem (from the official logo). Sits on a white tile so it reads on dark surfaces. */
export function LogoMark({ className, tile = false }: { className?: string; tile?: boolean }) {
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", tile && "rounded-xl bg-white p-1 shadow-sm", className ?? "size-9")}>
      <Image src="/brand/logo-mark.png" alt="" width={512} height={512} className="h-full w-full object-contain" priority />
    </span>
  );
}

/** Compact horizontal lockup for navigation. */
export function Logo({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark tile={dark} className="size-9" />
      <span className={cn("text-[15px] font-extrabold uppercase tracking-tight", dark ? "text-white" : "text-black")}>
        Trust <span className="text-[#E50914]">Manager</span>
      </span>
    </div>
  );
}

/** Full stacked logo, exactly as supplied. */
export function LogoFull({ className }: { className?: string }) {
  return <Image src="/brand/logo-full.png" alt="Trust Manager" width={900} height={678} className={cn("h-auto w-56", className)} priority />;
}
