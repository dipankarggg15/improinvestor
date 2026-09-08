export default function DashboardPage() {
  return (
    <section className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-16">
      <div className="max-w-full min-w-0 max-w-3xl text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
          ImproInvestor
        </p>
        <h1 className="text-4xl font-semibold text-[var(--foreground)] sm:text-6xl">
          ImproInvestor
        </h1>
        <p className="mt-5 text-lg text-[var(--muted)] sm:text-xl">
          Personal Strategy Research Lab
        </p>
      </div>
    </section>
  );
}
