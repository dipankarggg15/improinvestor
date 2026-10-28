import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/forgot-password?error=link", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/forgot-password?error=link", request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}

function safeNextPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/reset-password";
}
