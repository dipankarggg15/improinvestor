"use client";

import { PageLoadError } from "@/components/layout/page-load-error";

export default function FindingMomentumError({ reset }: { readonly reset: () => void }) {
  return <PageLoadError reset={reset} title="Could not load momentum rankings" />;
}
