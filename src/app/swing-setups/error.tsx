"use client";

import { PageLoadError } from "@/components/layout/page-load-error";

export default function SwingSetupsError({ reset }: { readonly reset: () => void }) {
  return <PageLoadError reset={reset} title="Could not load swing setups" />;
}
