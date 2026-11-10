import Link from "next/link";
import { LogoFull } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <LogoFull className="w-40" />
      <div>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted">The page you&apos;re looking for doesn&apos;t exist.</p>
      </div>
      <Button asChild><Link href="/overview">Back to overview</Link></Button>
    </div>
  );
}
