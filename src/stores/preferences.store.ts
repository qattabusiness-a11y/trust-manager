"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  sidebarCollapsed: boolean;
  quickAddOpen: boolean;
  receiptOpen: boolean;
  /** Preview the app as another household member (owner only, dev mode). */
  toggleSidebar: () => void;
  setQuickAdd: (open: boolean) => void;
  setReceiptOpen: (open: boolean) => void;
}

/** Pure UI state. Server data lives in TanStack Query, never here. */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      quickAddOpen: false,
      receiptOpen: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setQuickAdd: (quickAddOpen) => set({ quickAddOpen }),
      setReceiptOpen: (receiptOpen) => set({ receiptOpen }),
    }),
    { name: "tm:ui", partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) },
  ),
);
