import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/env";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const { url, serviceRoleKey } = supabaseConfig();
  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-application-name": "magon-payments" } },
  });
  return cached;
}
