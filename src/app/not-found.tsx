import Link from "next/link";

export default function NotFound() {
  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-full min-w-0 max-w-3xl rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5">
        <p className="text-sm font-medium text-[var(--accent)]">PRIVATE</p>
        <h1 className="mt-2 text-2xl font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">This ImproInvestor record does not exist or is not available.</p>
        <Link className="mt-5 inline-flex rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--accent)]" href="/">
          Back to Dashboard
        </Link>
      </div>
    </section>
  );
}
