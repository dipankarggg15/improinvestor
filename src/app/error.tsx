"use client";

import { PageLoadError } from "@/components/layout/page-load-error";

export default function GlobalError({ reset }: { readonly reset: () => void }) {
  return <PageLoadError reset={reset} title="Something went wrong" />;
}
