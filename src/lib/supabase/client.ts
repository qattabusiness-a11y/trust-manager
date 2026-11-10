"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "@/config/env";

let client: SupabaseClient | null = null;

/** Browser client using the public anon key. RLS protects every table. */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured. Set NEXT_PUBLIC_DATA_MODE=supabase and the URL/anon key.");
  client ??= createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  return client;
}
