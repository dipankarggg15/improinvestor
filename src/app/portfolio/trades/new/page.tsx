import { redirect } from "next/navigation";

type LegacyNewTradePageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function LegacyNewTradePage({ searchParams }: LegacyNewTradePageProps) {
  const query = await searchParams;
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }

  const queryString = params.toString();

  redirect(`/trades/new${queryString ? `?${queryString}` : ""}`);
}
