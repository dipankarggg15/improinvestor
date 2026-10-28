import Link from "next/link";
import { redirect } from "next/navigation";

import { updatePasswordAction } from "@/app/reset-password/actions";
import { getOwnerSession } from "@/lib/auth/server";

type ResetPasswordPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const [params, session] = await Promise.all([searchParams, getOwnerSession()]);
  if (!session) redirect("/forgot-password?error=link");

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-5 py-10 text-[var(--foreground)]">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <div className="mb-4 grid size-12 place-items-center rounded-md bg-[var(--accent)] font-semibold text-white">
            II
          </div>
          <p className="text-sm font-medium text-[var(--accent)]">ACCOUNT RECOVERY</p>
          <h1 className="mt-2 text-3xl font-semibold">Choose a new password</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Use at least 8 characters.</p>
        </div>

        <form action={updatePasswordAction} className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm sm:p-5">
          <label className="grid gap-2 text-sm font-medium">
            New password
            <input
              autoComplete="new-password"
              className="h-11 rounded-md border border-[var(--border)] px-3"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>
          <label className="mt-4 grid gap-2 text-sm font-medium">
            Confirm new password
            <input
              autoComplete="new-password"
              className="h-11 rounded-md border border-[var(--border)] px-3"
              minLength={8}
              name="passwordConfirmation"
              required
              type="password"
            />
          </label>

          {params.error ? (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {passwordError(params.error)}
            </p>
          ) : null}

          <button className="mt-5 h-11 w-full rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white" type="submit">
            Update password
          </button>
          <Link className="mt-4 block text-center text-sm font-medium text-[var(--accent)] hover:underline" href="/login">
            Back to sign in
          </Link>
        </form>
      </div>
    </main>
  );
}

function passwordError(error: string) {
  if (error === "length") return "Password must be at least 8 characters.";
  if (error === "match") return "The two passwords do not match.";
  return "The password could not be updated. Request a new recovery link and try again.";
}
