import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthConfig, isOwnerEmail } from "@/lib/auth/config";

export class AuthorizationError extends Error {
  constructor(message = "Owner access is required.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const config = getAuthConfig();

  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    throw new AuthorizationError("Supabase Auth is not configured.");
  }

  return createServerClient(config.supabaseUrl, config.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. Middleware and Server Actions refresh them.
        }
      },
    },
  });
}

export async function getOwnerSession() {
  const config = getAuthConfig();
  if (!config.supabaseUrl || !config.supabasePublishableKey || !config.ownerEmail) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !isOwnerEmail(user?.email, config.ownerEmail)) {
    return null;
  }

  return { user };
}

export async function requireOwner() {
  const session = await getOwnerSession();
  if (!session) {
    throw new AuthorizationError();
  }
  return session;
}

export async function requireOwnerPage() {
  const session = await getOwnerSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}
