export const VAT_RATE = 0.15;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Splits a VAT-inclusive total into the net amount and the VAT amount. */
export function splitVat(total: number): { net: number; vat: number } {
  const net = round2(total / (1 + VAT_RATE));
  return { net, vat: round2(total - net) };
}
