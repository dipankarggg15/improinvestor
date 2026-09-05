"use client";

export default function GlobalError() {
  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-3xl rounded-md border border-[var(--border)] bg-[var(--panel)] p-5">
        <p className="text-sm font-medium text-[var(--accent)]">PRIVATE</p>
        <h1 className="mt-2 text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Something went wrong while loading this data. The technical details were kept out of the browser.
        </p>
      </div>
    </section>
  );
}
