"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { SectorState } from "@/lib/sectors/service";
import { sectorSlug } from "@/lib/sectors/slug";

type StatusPayload = {
  readonly priceDateUsed: string | null;
  readonly states: Readonly<Record<string, SectorState>>;
};

let latestStatusRequest: Promise<StatusPayload> | null = null;

export function SectorStatus({ sector, date, className = "" }: {
  readonly sector: string | null | undefined;
  readonly date?: string | null;
  readonly className?: string;
}) {
  const [state, setState] = useState<SectorState | null>(null);

  useEffect(() => {
    if (!sector) return;
    let active = true;
    if (!latestStatusRequest) {
      latestStatusRequest = fetch("/api/sectors/status", { cache: "force-cache" }).then(async (response) => {
        if (!response.ok) throw new Error("Sector status is unavailable.");
        return response.json() as Promise<StatusPayload>;
      });
    }
    void latestStatusRequest.then((payload) => {
      if (active) setState(payload.states[sector] ?? null);
    }).catch(() => {
      if (active) setState(null);
      latestStatusRequest = null;
    });
    return () => { active = false; };
  }, [sector]);

  if (!sector) return <span className={className}>Unclassified</span>;
  const query = new URLSearchParams({ universe: "market" });
  if (date) query.set("date", date);
  return (
    <Link className={`inline-flex flex-wrap items-center gap-1 hover:underline ${className}`} href={`/sectors/${sectorSlug(sector)}?${query}`}>
      <span>{sector}</span>
      {state ? <span className={`font-semibold ${stateTone(state)}`}>· {state.toLowerCase()}</span> : null}
    </Link>
  );
}

function stateTone(state: SectorState) {
  return state === "LEADING" ? "text-emerald-700" : state === "IMPROVING" ? "text-sky-700" : state === "WEAKENING" ? "text-amber-700" : "text-red-700";
}
