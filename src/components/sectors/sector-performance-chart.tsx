import type { SectorSeriesPoint } from "@/lib/sectors/service";

export function SectorPerformanceChart({ benchmark, sector, sectorName }: {
  readonly benchmark: readonly SectorSeriesPoint[];
  readonly sector: readonly SectorSeriesPoint[];
  readonly sectorName: string;
}) {
  const benchmarkByDate = new Map(benchmark.map((point) => [point.date, point.value]));
  const aligned = sector.filter((point) => benchmarkByDate.has(point.date)).slice(-252);
  if (aligned.length < 2) {
    return <p className="rounded-md bg-[var(--panel-soft)] p-4 text-sm text-[var(--muted)]">Not enough benchmark history to draw the comparison chart.</p>;
  }
  const sectorBase = aligned[0]!.value;
  const benchmarkBase = benchmarkByDate.get(aligned[0]!.date)!;
  const sectorValues = aligned.map((point) => point.value / sectorBase * 100);
  const benchmarkValues = aligned.map((point) => benchmarkByDate.get(point.date)! / benchmarkBase * 100);
  const values = [...sectorValues, ...benchmarkValues];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(1, maximum - minimum);
  const width = 1000;
  const height = 300;
  const padding = 24;
  const points = (series: readonly number[]) => series.map((value, index) => {
    const x = padding + index / Math.max(1, series.length - 1) * (width - padding * 2);
    const y = padding + (maximum - value) / range * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs font-medium">
        <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-emerald-600" />{sectorName} equal-weight basket</span>
        <span className="flex items-center gap-2"><span className="h-0.5 w-5 bg-slate-500" />NIFTY 50</span>
      </div>
      <svg aria-label={`${sectorName} performance compared with NIFTY 50`} className="h-auto w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
        <line stroke="#d1d5db" strokeDasharray="5 5" x1={padding} x2={width - padding} y1={padding + (maximum - 100) / range * (height - padding * 2)} y2={padding + (maximum - 100) / range * (height - padding * 2)} />
        <polyline fill="none" points={points(benchmarkValues)} stroke="#64748b" strokeWidth="3" />
        <polyline fill="none" points={points(sectorValues)} stroke="#059669" strokeWidth="4" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-[var(--muted)]"><span>{aligned[0]!.date}</span><span>{aligned.at(-1)!.date}</span></div>
    </div>
  );
}
