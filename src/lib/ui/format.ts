const crore = 10_000_000;

export function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function formatCrores(value: number) {
  return `₹${(value / crore).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} Cr`;
}

export function formatCurrency(value: number) {
  return `₹${value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return `${value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}%`;
}

export function formatQuantity(value: number) {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
  });
}
