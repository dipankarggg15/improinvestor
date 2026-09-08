export function isOwnerEmail(email: string | null | undefined, ownerEmail: string) {
  if (!email || !ownerEmail) return false;
  return email.trim().toLowerCase() === ownerEmail.trim().toLowerCase();
}

const protectedRoutes = [
  "/",
  "/strategies",
  "/portfolio",
  "/stocks",
  "/screener",
  "/return-history",
  "/analytics",
  "/research",
  "/api/research",
  "/settings",
] as const;

export function isProtectedPath(pathname: string) {
  if (pathname === "/login") return false;
  return protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
