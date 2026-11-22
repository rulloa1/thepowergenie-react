export function billingMonths(end: string): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(end)) return [];
  const [year, month] = end.split('-').map(Number);
  return Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(year, month - 12 + index, 1)).toISOString().slice(0, 7));
}

export function previousBillingMonth(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}
