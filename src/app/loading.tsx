export default function Loading() {
  return (
    <section aria-busy="true" aria-label="Loading workspace" className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-full min-w-0 max-w-7xl animate-pulse space-y-5">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
          <div className="h-3 w-32 rounded-full bg-[var(--panel-soft)]" />
          <div className="mt-3 h-8 w-64 max-w-full rounded-md bg-[var(--panel-soft)]" />
          <div className="mt-3 h-4 w-full max-w-xl rounded-md bg-[var(--panel-soft)]" />
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="h-24 rounded-md border border-[var(--border)] bg-[var(--panel)] p-4" key={index}>
              <div className="h-3 w-24 rounded-md bg-[var(--panel-soft)]" />
              <div className="mt-4 h-5 w-32 rounded-md bg-[var(--panel-soft)]" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
          <div className="h-5 w-48 rounded-md bg-[var(--panel-soft)]" />
          <div className="mt-5 space-y-3">{Array.from({ length: 5 }).map((_, index) => <div className="grid grid-cols-[2rem_1fr_0.7fr] gap-3" key={index}><div className="h-5 rounded bg-[var(--panel-soft)]" /><div className="h-5 rounded bg-[var(--panel-soft)]" /><div className="h-5 rounded bg-[var(--panel-soft)]" /></div>)}</div>
        </div>
        <span className="sr-only">Loading the latest market and portfolio information…</span>
      </div>
    </section>
  );
}
