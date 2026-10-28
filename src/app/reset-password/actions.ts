"use server";

import { redirect } from "next/navigation";

import { getOwnerSession, createSupabaseServerClient } from "@/lib/auth/server";

export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("passwordConfirmation") ?? "");

  if (password.length < 8) {
    redirect("/reset-password?error=length");
  }
  if (password !== confirmation) {
    redirect("/reset-password?error=match");
  }

  const session = await getOwnerSession();
  if (!session) {
    redirect("/forgot-password?error=link");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect("/reset-password?error=update");
  }

  await supabase.auth.signOut();
  redirect("/login?password=updated");
}
