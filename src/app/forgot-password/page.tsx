import Link from "next/link";

import { requestPasswordResetAction } from "@/app/forgot-password/actions";

type ForgotPasswordPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] px-5 py-10 text-[var(--foreground)]">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <div className="mb-4 grid size-12 place-items-center rounded-md bg-[var(--accent)] font-semibold text-white">
            II
          </div>
          <p className="text-sm font-medium text-[var(--accent)]">ACCOUNT RECOVERY</p>
          <h1 className="mt-2 text-3xl font-semibold">Reset your password</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Enter the owner email and we will send a secure password-reset link.
          </p>
        </div>

        <form
          action={requestPasswordResetAction}
          className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm sm:p-5"
        >
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

          {params.sent ? (
            <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              If that is the owner email, a password-reset link has been sent. Check the inbox and spam folder.
            </p>
          ) : null}
          {params.error ? (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {recoveryError(params.error)}
            </p>
          ) : null}

          <button className="mt-5 h-11 w-full rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white" type="submit">
            Send reset link
          </button>
          <Link className="mt-4 block text-center text-sm font-medium text-[var(--accent)] hover:underline" href="/login">
            Back to sign in
          </Link>
        </form>
      </div>
    </main>
  );
}

function recoveryError(error: string) {
  if (error === "config") return "Password recovery is not configured yet.";
  if (error === "link") return "That recovery link is invalid or has expired. Request a new link and try again.";
  if (error === "rate") return "Too many recovery attempts were made. Wait a few minutes, then try again.";
  return "The recovery email could not be sent. Please try again.";
}
