/** Format microcents (1/10000 of a cent) as a dollar string. */
export function formatCost(microcents: number): string {
  if (microcents === 0) return "$0.00";
  const dollars = microcents / 1_000_000;
  if (dollars < 0.01) return "< $0.01";
  return `$${dollars.toFixed(2)}`;
}

/** Format a token count with commas. */
export function formatTokens(count: number): string {
  return count.toLocaleString("en-US");
}
