import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/auth/middleware";
import { isProtectedPath } from "@/lib/auth/policy";

export async function middleware(request: NextRequest) {
  if (!isProtectedPath(request.nextUrl.pathname)) {
    return;
  }

  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
