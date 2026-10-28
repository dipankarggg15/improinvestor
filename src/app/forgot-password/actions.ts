"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthConfig } from "@/lib/auth/config";
import { isOwnerEmail } from "@/lib/auth/policy";
import { createSupabaseServerClient } from "@/lib/auth/server";

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const config = getAuthConfig();

  if (!config.supabaseUrl || !config.supabasePublishableKey || !config.ownerEmail) {
    redirect("/forgot-password?error=config");
  }

  if (isOwnerEmail(email, config.ownerEmail)) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // The project Site URL is already approved by Supabase. Returning to its
      // root avoids requiring a second callback URL in the redirect allowlist;
      // middleware exchanges the recovery code before opening reset-password.
      redirectTo: await getPublicOrigin(),
    });

    if (error) {
      console.error("[password-recovery] Supabase rejected the request", {
        code: error.code,
        message: error.message,
        status: error.status,
      });
      redirect(`/forgot-password?error=${error.status === 429 ? "rate" : "send"}`);
    }
  }

  // Use the same response for unknown addresses so the owner allowlist is not disclosed.
  redirect("/forgot-password?sent=1");
}

async function getPublicOrigin() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configuredUrl) return configuredUrl;

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  return host ? `${protocol}://${host}` : "http://localhost:3000";
}
