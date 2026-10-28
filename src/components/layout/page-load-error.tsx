"use client";

type PageLoadErrorProps = {
  readonly reset: () => void;
  readonly title?: string;
};

export function PageLoadError({ reset, title = "Could not load this workspace" }: PageLoadErrorProps) {
  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-full min-w-0 max-w-3xl rounded-md border border-red-200 bg-[var(--panel)] p-4 sm:p-5">
        <p className="text-sm font-medium text-red-700">LOAD ERROR</p>
        <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          The request did not complete. Your saved strategies, experiments, and trades were not changed.
        </p>
        <button
          className="mt-4 h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white"
          onClick={reset}
          type="button"
        >
          Try Again
        </button>
      </div>
    </section>
  );
}
