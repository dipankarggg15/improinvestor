import Link from "next/link";

type EmptyStateProps = {
  readonly title: string;
  readonly description: string;
  readonly action?: { readonly href: string; readonly label: string };
  readonly secondaryAction?: { readonly href: string; readonly label: string };
  readonly icon?: string;
};

export function EmptyState({ action, description, icon = "↗", secondaryAction, title }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel-raised)] px-5 py-10 text-center sm:px-8">
      <span aria-hidden="true" className="mx-auto grid size-11 place-items-center rounded-full bg-[var(--panel-soft)] text-lg font-semibold text-[var(--accent)]">{icon}</span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--muted)]">{description}</p>
      {action || secondaryAction ? <div className="mt-5 flex flex-wrap justify-center gap-2">
        {action ? <Link className="inline-flex min-h-10 items-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]" href={action.href}>{action.label}</Link> : null}
        {secondaryAction ? <Link className="inline-flex min-h-10 items-center rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--panel-soft)]" href={secondaryAction.href}>{secondaryAction.label}</Link> : null}
      </div> : null}
    </div>
  );
}
