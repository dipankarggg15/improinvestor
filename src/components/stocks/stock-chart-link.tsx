import Link from "next/link";
import type { ReactNode } from "react";

type StockChartLinkProps = {
  readonly exchange: string;
  readonly symbol: string;
  readonly date?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly children: ReactNode;
  readonly className?: string;
};

export function StockChartLink({ children, className, date, endDate, exchange, startDate, symbol }: StockChartLinkProps) {
  return (
    <Link
      className={className}
      href={stockChartHref({ date, endDate, exchange, startDate, symbol })}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </Link>
  );
}

export function stockChartHref({ date, endDate, exchange, startDate, symbol }: {
  readonly exchange: string;
  readonly symbol: string;
  readonly date?: string;
  readonly startDate?: string;
  readonly endDate?: string;
}) {
  const path = `/charts/${encodeURIComponent(exchange.toUpperCase())}/${encodeURIComponent(symbol.toUpperCase())}`;
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  else if (date) params.set("date", date);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
