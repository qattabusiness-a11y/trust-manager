"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { AuthSync } from "./AuthSync";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Data stays fresh for 2 minutes: moving between pages is instant, and other
          // household members' changes arrive on the next focus or refresh.
          queries: { staleTime: 120_000, gcTime: 30 * 60_000, refetchOnWindowFocus: true, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );
  useEffect(() => {
    // Errors already shown to the user (toast) should not surface again as unhandled rejections.
    const onRejection = (e: PromiseRejectionEvent) => {
      if ((e.reason as { handled?: boolean } | null)?.handled) e.preventDefault();
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);
  return (
    <QueryClientProvider client={client}>
      <AuthSync />
      {children}
      <Toaster position="top-center" richColors closeButton toastOptions={{ className: "font-sans" }} />
    </QueryClientProvider>
  );
}
