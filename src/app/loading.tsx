export default function Loading() {
  return (
    <section className="px-5 py-6 sm:px-8 lg:px-10">
      <div className="max-w-7xl space-y-5">
        <div>
          <div className="h-4 w-44 rounded-md bg-[var(--panel-soft)]" />
          <div className="mt-3 h-8 w-72 rounded-md bg-[var(--panel-soft)]" />
          <div className="mt-3 h-4 w-full max-w-xl rounded-md bg-[var(--panel-soft)]" />
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="h-24 rounded-md border border-[var(--border)] bg-[var(--panel)] p-4" key={index}>
              <div className="h-3 w-24 rounded-md bg-[var(--panel-soft)]" />
              <div className="mt-4 h-5 w-32 rounded-md bg-[var(--panel-soft)]" />
            </div>
          ))}
        </div>
        <div className="h-80 rounded-md border border-[var(--border)] bg-[var(--panel)]" />
      </div>
    </section>
  );
}
