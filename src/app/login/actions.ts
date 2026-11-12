"use server";

import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/supabase/server";
import { readStrings, type FormState } from "@/lib/form-state";
import { safeNextPath } from "@/lib/safe-redirect";

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { email, password } = readStrings(formData, ["email", "password"]);
  const next = safeNextPath(readStrings(formData, ["next"]).next);

  const fieldErrors: Record<string, string> = {};
  if (!email) fieldErrors.email = "Enter your email address.";
  if (!password) fieldErrors.password = "Enter your password.";
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Enter your email and password.", fieldErrors, values: { email } };
  }

  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { error: "That email and password did not match.", values: { email } };
  }

  // Signing in is not enough. The account must also have an owner profile.
  // This client holds the new session in memory, so the check runs as the
  // signed-in user under RLS without relying on the cookies being re-read.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile) {
    await supabase.auth.signOut();
    return { error: "This account is not authorized for BuildPro CRM.", values: { email } };
  }

  redirect(next);
}
