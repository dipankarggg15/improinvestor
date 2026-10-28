export function calculateIndexConstituentReturns(closesNewestFirst: readonly number[]) {
  const lastPrice = validClose(closesNewestFirst[0]);
  return {
    lastPrice,
    return1D: periodReturn(lastPrice, validClose(closesNewestFirst[1])),
    return1M: periodReturn(lastPrice, validClose(closesNewestFirst[21])),
    return3M: periodReturn(lastPrice, validClose(closesNewestFirst[63])),
  };
}

function periodReturn(latest: number | null, previous: number | null) {
  return latest === null || previous === null || previous <= 0 ? null : (latest / previous - 1) * 100;
}

function validClose(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : null;
}
