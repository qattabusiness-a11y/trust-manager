"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface AuthState {
  userId: string | null;
  householdId: string | null;
  hydrated: boolean;
  setSession: (userId: string | null, householdId?: string | null) => void;
  setHousehold: (householdId: string | null) => void;
  signOut: () => void;
  markHydrated: () => void;
}

/** Session pointer only — no financial data lives in client state. */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      householdId: null,
      hydrated: false,
      setSession: (userId, householdId = null) => set({ userId, householdId }),
      setHousehold: (householdId) => set({ householdId }),
      signOut: () => set({ userId: null, householdId: null }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "tm:session",
      storage: createJSONStorage(() => sessionStorageFallback()),
      partialize: (s) => ({ userId: s.userId, householdId: s.householdId }),
      onRehydrateStorage: () => (state) => state?.markHydrated(),
    },
  ),
);

function sessionStorageFallback(): Storage {
  // Keep the session across tabs/reloads in dev mode.
  return typeof window !== "undefined" ? window.localStorage : (undefined as unknown as Storage);
}
