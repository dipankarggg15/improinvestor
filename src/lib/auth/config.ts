import "server-only";

export { isOwnerEmail } from "@/lib/auth/policy";

export function getAuthConfig() {
  return {
    ownerEmail: process.env.OWNER_EMAIL?.trim().toLowerCase() ?? "",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  };
}
