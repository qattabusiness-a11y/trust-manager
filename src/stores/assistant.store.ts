"use client";

import { create } from "zustand";
import type { Draft } from "@/lib/assistant/types";

export type DraftStatus = "pending" | "saving" | "saved" | "error";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  attachments?: { name: string; kind: "image" | "file" }[];
  drafts?: Draft[];
  status?: Record<string, DraftStatus>;
  errors?: Record<string, string>;
  busy?: boolean;
}

interface AssistantState {
  open: boolean;
  messages: ChatMessage[];
  setOpen: (open: boolean) => void;
  push: (m: ChatMessage) => void;
  patch: (id: string, fn: (m: ChatMessage) => ChatMessage) => void;
  clear: () => void;
}

/**
 * Conversation kept in memory only (survives moving between pages, not a
 * reload). Nothing typed here is stored until the person saves a draft.
 */
export const useAssistantStore = create<AssistantState>()((set) => ({
  open: false,
  messages: [],
  setOpen: (open) => set({ open }),
  push: (m) => set((s) => ({ messages: [...s.messages, m] })),
  patch: (id, fn) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? fn(m) : m)) })),
  clear: () => set({ messages: [] }),
}));
