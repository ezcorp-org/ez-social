import { describe, it, expect } from "vitest";
import { formatCost, formatTokens } from "./format";

describe("formatCost", () => {
  it("returns $0.00 for zero", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("returns < $0.01 for very small amounts", () => {
    expect(formatCost(1)).toBe("< $0.01");
    expect(formatCost(500)).toBe("< $0.01");
    expect(formatCost(9999)).toBe("< $0.01");
  });

  it("formats normal amounts", () => {
    // 10000 microcents = $0.01
    expect(formatCost(10000)).toBe("$0.01");
    // 30000 microcents = $0.03
    expect(formatCost(30000)).toBe("$0.03");
  });

  it("formats larger amounts", () => {
    // 1,240,000 microcents = $1.24
    expect(formatCost(1_240_000)).toBe("$1.24");
    // 100,000,000 microcents = $100.00
    expect(formatCost(100_000_000)).toBe("$100.00");
  });
});

describe("formatTokens", () => {
  it("formats small numbers", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
  });

  it("formats numbers with commas", () => {
    expect(formatTokens(1234)).toBe("1,234");
    expect(formatTokens(1234567)).toBe("1,234,567");
  });
});
