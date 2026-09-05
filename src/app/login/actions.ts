"use server";

import { redirect } from "next/navigation";

import { getAuthConfig } from "@/lib/auth/config";
import { isOwnerEmail } from "@/lib/auth/policy";
import { createSupabaseServerClient } from "@/lib/auth/server";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? "/"));
  const config = getAuthConfig();

  if (!config.supabaseUrl || !config.supabasePublishableKey || !config.ownerEmail) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isOwnerEmail(user?.email, config.ownerEmail)) {
    await supabase.auth.signOut();
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  redirect(next);
}

function safeNextPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
