/**
 * Runtime configuration. Only NEXT_PUBLIC_* values are readable in the
 * browser; secrets (service role key, AI keys) must stay server-side.
 */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  /** "local" (default) keeps all data in this browser. "supabase" requires the two values above. */
  dataMode: (process.env.NEXT_PUBLIC_DATA_MODE ?? "local") as "local" | "supabase",
};

export function isSupabaseConfigured(): boolean {
  return env.dataMode === "supabase" && Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export const isDevDataMode = () => !isSupabaseConfigured();
