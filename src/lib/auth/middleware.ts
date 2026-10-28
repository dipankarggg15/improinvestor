import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isOwnerEmail } from "@/lib/auth/policy";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (process.env.LOCAL_AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production") {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase() ?? "";

  if (!supabaseUrl || !supabasePublishableKey || !ownerEmail) {
    return redirectToLogin(request, response);
  }

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isOwnerEmail(user?.email, ownerEmail)) {
    return redirectToLogin(request, response);
  }

  return response;
}

export async function exchangeRecoveryCode(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase() ?? "";
  const code = request.nextUrl.searchParams.get("code");
  const invalidLinkUrl = new URL("/forgot-password?error=link", request.url);

  if (!supabaseUrl || !supabasePublishableKey || !ownerEmail || !code) {
    return NextResponse.redirect(invalidLinkUrl);
  }

  const resetUrl = new URL("/reset-password", request.url);
  let response = NextResponse.redirect(resetUrl);
  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !isOwnerEmail(data.user?.email, ownerEmail)) {
    response = NextResponse.redirect(invalidLinkUrl);
    return response;
  }

  return response;
}

function redirectToLogin(request: NextRequest, response: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  response = NextResponse.redirect(url);
  return response;
}
