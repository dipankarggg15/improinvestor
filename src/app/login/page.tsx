import { redirect } from "next/navigation";

import { loginAction } from "@/app/login/actions";
import { getOwnerSession } from "@/lib/auth/server";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [params, session] = await Promise.all([searchParams, getOwnerSession()]);

  if (session) {
    redirect(safeNextPath(params.next ?? "/"));
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-5 py-10 text-[var(--foreground)]">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <div className="mb-4 grid size-12 place-items-center rounded-md bg-[var(--accent)] font-semibold text-white">
            II
          </div>
          <p className="text-sm font-medium text-[var(--accent)]">PRIVATE</p>
          <h1 className="mt-2 text-3xl font-semibold">ImproInvestor</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Private Investment Research System</p>
        </div>

        <form action={loginAction} className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5 shadow-sm">
          <input name="next" type="hidden" value={safeNextPath(params.next ?? "/")} />
          <label className="grid gap-2 text-sm font-medium">
            Email
            <input
              autoComplete="email"
              className="h-11 rounded-md border border-[var(--border)] px-3"
              name="email"
              required
              type="email"
            />
          </label>
          <label className="mt-4 grid gap-2 text-sm font-medium">
            Password
            <input
              autoComplete="current-password"
              className="h-11 rounded-md border border-[var(--border)] px-3"
              name="password"
              required
              type="password"
            />
          </label>
          {params.error ? (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              Unable to sign in. Check your credentials and try again.
            </p>
          ) : null}
          <button className="mt-5 h-11 w-full rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white" type="submit">
            Sign In
          </button>
        </form>
      </div>
    </main>
  );
}

function safeNextPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
