import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Service role client. It bypasses row level security, so it is used only
// on the server, and only after the caller has proven authority: either a
// valid, unexpired signing token (client pages) or an owner session checked
// by the caller (owner actions that touch storage).
let adminClient: SupabaseClient | undefined;

export function createAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return adminClient;
}
