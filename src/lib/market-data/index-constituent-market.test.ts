import { describe, expect, it } from "vitest";

import { calculateIndexConstituentReturns } from "./index-constituent-returns";

describe("calculateIndexConstituentReturns", () => {
  it("calculates 1D, 1M, and 3M returns from trading-session closes", () => {
    const closes = Array.from({ length: 64 }, () => 80);
    closes[0] = 100;
    closes[1] = 95;
    closes[21] = 90;
    closes[63] = 80;

    expect(calculateIndexConstituentReturns(closes)).toEqual({
      lastPrice: 100,
      return1D: expect.closeTo(5.2631578947),
      return1M: expect.closeTo(11.1111111111),
      return3M: 25,
    });
  });

  it("leaves unavailable periods blank instead of inventing returns", () => {
    expect(calculateIndexConstituentReturns([100, 90])).toEqual({
      lastPrice: 100,
      return1D: expect.closeTo(11.1111111111),
      return1M: null,
      return3M: null,
    });
  });
});
