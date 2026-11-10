"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isSupabaseConfigured } from "@/config/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/auth.store";

/**
 * Keeps the app's session pointer in step with Supabase Auth: restores a
 * session after an email-confirmation or password-reset link, and signs the
 * app out when the Supabase session ends (expiry, sign-out in another tab).
 */
export function AuthSync() {
  const qc = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((event, session) => {
      const store = useAuthStore.getState();
      if (event === "PASSWORD_RECOVERY") {
        router.replace("/reset-password");
        return;
      }
      if (session?.user) {
        if (store.userId !== session.user.id) {
          store.setSession(session.user.id, null);
          void qc.invalidateQueries();
        }
      } else if ((event === "SIGNED_OUT" || event === "INITIAL_SESSION") && store.userId) {
        store.signOut();
        qc.clear();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [qc, router]);

  return null;
}
