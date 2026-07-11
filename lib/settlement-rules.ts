/** Pure settlement rules — no DB/I/O, so they're unit-testable in isolation. */

/** Extracts the partner uuid encoded in a partner-settlement's notes (`partner:<uuid>`), or null. */
export function parsePartnerIdFromNotes(notes: string | null): string | null {
  return notes?.match(/^partner:([0-9a-f-]{36})$/i)?.[1] ?? null
}

/**
 * Period span of a settlement from its covered orders' (Brisbane) date strings.
 * Empty (a bonus-only driver settlement) falls back to `fallbackDate` for both
 * ends, so it never renders as an empty or reversed range.
 */
export function settlementPeriod(dates: string[], fallbackDate: string): { periodStart: string; periodEnd: string } {
  const sorted = [...dates].sort()
  const periodStart = sorted[0] ?? fallbackDate
  const periodEnd = sorted[sorted.length - 1] ?? periodStart
  return { periodStart, periodEnd }
}
