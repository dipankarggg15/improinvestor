"use client";

import { useEffect, useMemo, useState } from "react";

import { recordTradeAction } from "@/app/portfolio/actions";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";

type PortfolioOption = {
  readonly id: string;
  readonly name: string;
  readonly strategyId: string;
  readonly strategy: { readonly name: string };
};

type StrategyVersionOption = {
  readonly id: string;
  readonly strategyId: string;
  readonly versionNumber: number;
  readonly label: string | null;
  readonly strategy: { readonly name: string };
};

type StockSuggestion = {
  readonly key: string;
  readonly portfolioId: string | null;
  readonly companyId: string;
  readonly instrumentId: string;
  readonly companyName: string;
  readonly symbol: string;
  readonly exchange: string;
  readonly availableQuantity?: string;
  readonly strategyLabel?: string;
};

export function TradeEntryForm({
  portfolios,
  strategyVersions,
}: {
  readonly portfolios: PortfolioOption[];
  readonly strategyVersions: StrategyVersionOption[];
}) {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [strategyVersionId, setStrategyVersionId] = useState("");
  const [selectedStock, setSelectedStock] = useState<StockSuggestion | null>(null);
  const [formError, setFormError] = useState("");
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const portfolioByStrategyId = useMemo(
    () => new Map(portfolios.map((portfolio) => [portfolio.strategyId, portfolio.id])),
    [portfolios],
  );
  const selectedStrategyVersion = strategyVersions.find((version) => version.id === strategyVersionId);
  const defaultPortfolioId = portfolios[0]?.id ?? "";
  const portfolioId = selectedStock?.portfolioId
    ?? (selectedStrategyVersion ? portfolioByStrategyId.get(selectedStrategyVersion.strategyId) : null)
    ?? defaultPortfolioId;

  function changeSide(nextSide: "BUY" | "SELL") {
    setSide(nextSide);
    setSelectedStock(null);
    setFormError("");
  }

  return (
    <section className="px-4 py-5 sm:px-6 lg:px-10">
      <div className="max-w-full min-w-0 max-w-4xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">SYNTHETIC MARKET DATA</p>
          <h1 className="mt-2 text-3xl font-semibold">Record Trade</h1>
        </div>

        <form
          action={recordTradeAction}
          className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 sm:p-5"
          onSubmit={(event) => {
            if (selectedStock) return;
            event.preventDefault();
            setFormError("Select a stock from the search results before recording the trade.");
          }}
        >
          <input name="portfolioId" type="hidden" value={portfolioId} />
          <input name="side" type="hidden" value={side} />
          <input name="stockKey" type="hidden" value={selectedStock?.key ?? ""} />
          <input name="companyId" type="hidden" value={selectedStock?.companyId ?? ""} />
          <input name="instrumentId" type="hidden" value={selectedStock?.instrumentId ?? ""} />
          <div className="grid gap-5">
            <div className="grid gap-2 text-sm font-medium">
              Type
              <div className="grid grid-cols-2 rounded-md border border-[var(--border)] p-1 sm:w-64">
                {(["BUY", "SELL"] as const).map((option) => (
                  <button
                    className={`h-10 rounded text-sm font-semibold transition ${
                      side === option ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:bg-[var(--surface)]"
                    }`}
                    key={option}
                    onClick={() => changeSide(option)}
                    type="button"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <StockAutocomplete
              key={side}
              label="Stock"
              onSelect={(stock) => {
                setSelectedStock(stock);
                setFormError("");
              }}
              searchMode={side}
              selectedStock={selectedStock}
            />
            {formError ? <p className="text-sm font-medium text-red-600">{formError}</p> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput defaultValue={today} label="Date" name="tradeDate" type="date" />
              <TextInput
                label="Quantity"
                max={side === "SELL" ? selectedStock?.availableQuantity : undefined}
                min="0.000001"
                name="quantity"
                step="0.000001"
                type="number"
              />
              <TextInput label="Price" min="0.0001" name="price" step="0.0001" type="number" />
              <TextInput defaultValue="0.00" label="Fees" min="0" name="fees" step="0.0001" type="number" />
            </div>

            {side === "BUY" ? (
              <label className="grid gap-2 text-sm font-medium">
                Strategy Attribution
                <select
                  className="h-11 rounded-md border border-[var(--border)] px-3"
                  name="strategyVersionId"
                  onChange={(event) => setStrategyVersionId(event.target.value)}
                  value={strategyVersionId}
                >
                  <option value="">None / Unassigned</option>
                  {strategyVersions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.strategy.name} V{version.versionNumber}{version.label ? ` - ${version.label}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <input name="strategyVersionId" type="hidden" value="" />
                <p className="text-sm text-[var(--muted)]">
                  Strategy attribution is inherited from the selected open holding.
                </p>
              </>
            )}

            <label className="grid gap-2 text-sm font-medium">
              Notes
              <textarea className="min-h-20 rounded-md border border-[var(--border)] p-3" name="notes" />
            </label>

            <ConfirmSubmitButton
              className="h-11 w-fit rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              confirmMessage={`Record this ${side} trade in the immutable trade ledger?`}
              pendingLabel="Saving..."
            >
              Record Trade
            </ConfirmSubmitButton>
          </div>
        </form>
      </div>
    </section>
  );
}

function StockAutocomplete({
  label,
  onSelect,
  searchMode,
  selectedStock,
}: {
  readonly label: string;
  readonly onSelect: (stock: StockSuggestion | null) => void;
  readonly searchMode: "BUY" | "SELL";
  readonly selectedStock: StockSuggestion | null;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || selectedStock) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      const params = new URLSearchParams({ side: searchMode, q: trimmed });
      try {
        setLoading(true);
        const response = await fetch(`/trades/search?${params.toString()}`, { signal: controller.signal });
        const payload = await response.json() as { readonly results?: StockSuggestion[] };
        setSuggestions(payload.results ?? []);
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, searchMode, selectedStock]);

  function selectStock(stock: StockSuggestion) {
    onSelect(stock);
    setQuery(`${stock.companyName} ${stock.symbol}`);
    setSuggestions([]);
    setLoading(false);
  }

  function updateQuery(value: string) {
    setQuery(value);
    onSelect(null);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
    }
  }

  return (
    <label className="relative grid gap-2 text-sm font-medium">
      {label}
      <input
        autoComplete="off"
        className="h-11 rounded-md border border-[var(--border)] px-3"
        onChange={(event) => updateQuery(event.target.value)}
        placeholder="Search company or symbol..."
        required
        value={query}
      />
      {selectedStock ? (
        <span className="text-xs text-[var(--muted)]">
          Selected: {selectedStock.companyName} · {selectedStock.symbol} · {selectedStock.exchange}
          {selectedStock.availableQuantity ? ` · Available ${selectedStock.availableQuantity}` : ""}
        </span>
      ) : null}
      {!selectedStock && query.trim().length >= 2 ? (
        <div className="absolute top-[74px] z-20 max-h-72 w-full overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--panel)] shadow-lg">
          {loading ? <p className="px-3 py-2 text-sm text-[var(--muted)]">Searching...</p> : null}
          {!loading && suggestions.length === 0 ? <p className="px-3 py-2 text-sm text-[var(--muted)]">No matches</p> : null}
          {suggestions.map((stock) => (
            <button
              className="block w-full px-3 py-2 text-left hover:bg-[var(--surface)]"
              key={stock.key}
              onMouseDown={(event) => {
                event.preventDefault();
                selectStock(stock);
              }}
              type="button"
            >
              <span className="block text-sm font-semibold">{stock.companyName}</span>
              <span className="text-xs text-[var(--muted)]">
                {stock.symbol} · {stock.exchange}
                {stock.strategyLabel ? ` · ${stock.strategyLabel}` : ""}
                {stock.availableQuantity ? ` · Qty ${stock.availableQuantity}` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

function TextInput({
  defaultValue,
  label,
  max,
  min,
  name,
  step,
  type,
}: {
  readonly defaultValue?: string;
  readonly label: string;
  readonly max?: string;
  readonly min?: string;
  readonly name: string;
  readonly step?: string;
  readonly type: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        className="h-11 rounded-md border border-[var(--border)] px-3"
        defaultValue={defaultValue}
        max={max}
        min={min}
        name={name}
        required
        step={step}
        type={type}
      />
    </label>
  );
}
