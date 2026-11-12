import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createUserClient } from "@/lib/supabase/server";

export type OwnerContext = {
  supabase: SupabaseClient;
  user: User;
  profile: { id: string; full_name: string; title: string | null; email: string };
  actor: string; // written to audit_log.actor
};

// Returns the signed-in owner, or null. A valid Auth session without a
// profile row is not an owner, so it gets nothing.
export async function getOwnerContext(): Promise<OwnerContext | null> {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, title, email")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;

  return { supabase, user, profile, actor: `owner:${user.id}` };
}

// For server pages and server actions: send visitors to sign in.
export async function requireOwner(): Promise<OwnerContext> {
  const ctx = await getOwnerContext();
  if (!ctx) redirect("/login");
  return ctx;
}
