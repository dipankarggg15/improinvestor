type PlaceholderPageProps = {
  title: string;
};

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <section className="px-6 py-10 sm:px-10">
      <div className="max-w-4xl">
        <p className="text-sm font-medium text-[var(--accent)]">ImproInvestor</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">{title}</h1>
        <p className="mt-4 max-w-2xl text-[var(--muted)]">
          This section is intentionally reserved for the next planning step.
        </p>
      </div>
    </section>
  );
}
