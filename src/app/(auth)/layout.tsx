import { ShieldCheck, TrendingDown, Wallet } from "lucide-react";
import { Logo, LogoFull } from "@/components/layout/Logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="sidebar-texture relative hidden flex-col justify-between p-10 text-white lg:flex">
        <Logo dark />
        <div className="max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight">Someone watching over your household money — every day.</p>
          <ul className="mt-8 space-y-4 text-sm text-white/80">
            <li className="flex gap-3"><Wallet className="size-5 text-green-400" /> Know exactly how much you can safely spend today.</li>
            <li className="flex gap-3"><TrendingDown className="size-5 text-green-400" /> Spot rising prices and bulk-buy savings in Kigali markets.</li>
            <li className="flex gap-3"><ShieldCheck className="size-5 text-green-400" /> Receipts are read and deleted immediately — never stored.</li>
          </ul>
        </div>
        <p className="text-xs text-white/50">Built for households in Rwanda. Amounts in RWF by default.</p>
      </aside>
      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-6 lg:hidden"><LogoFull className="w-40" /></div>
        {children}
      </main>
    </div>
  );
}
