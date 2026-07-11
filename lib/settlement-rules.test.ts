import { describe, expect, it } from 'vitest'
import { parsePartnerIdFromNotes, settlementPeriod } from './settlement-rules'

describe('parsePartnerIdFromNotes', () => {
  const uuid = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'

  it('extracts the partner uuid from partner-encoded notes', () => {
    expect(parsePartnerIdFromNotes(`partner:${uuid}`)).toBe(uuid)
  })

  it('is case-insensitive on the uuid', () => {
    expect(parsePartnerIdFromNotes(`partner:${uuid.toUpperCase()}`)).toBe(uuid.toUpperCase())
  })

  it('returns null for null, empty, or non-partner notes', () => {
    expect(parsePartnerIdFromNotes(null)).toBe(null)
    expect(parsePartnerIdFromNotes('')).toBe(null)
    expect(parsePartnerIdFromNotes('just a driver note')).toBe(null)
    expect(parsePartnerIdFromNotes('partner:not-a-uuid')).toBe(null)
  })
})

describe('settlementPeriod', () => {
  it('spans from earliest to latest date', () => {
    expect(settlementPeriod(['2026-07-09', '2026-07-07', '2026-07-11'], '2026-07-12')).toEqual({
      periodStart: '2026-07-07',
      periodEnd: '2026-07-11',
    })
  })

  it('a single date makes start = end', () => {
    expect(settlementPeriod(['2026-07-08'], '2026-07-12')).toEqual({ periodStart: '2026-07-08', periodEnd: '2026-07-08' })
  })

  it('no dates (bonus-only settlement) falls back to the given date for both ends', () => {
    expect(settlementPeriod([], '2026-07-12')).toEqual({ periodStart: '2026-07-12', periodEnd: '2026-07-12' })
  })

  it('does not mutate the input array', () => {
    const dates = ['2026-07-09', '2026-07-07']
    settlementPeriod(dates, '2026-07-12')
    expect(dates).toEqual(['2026-07-09', '2026-07-07'])
  })
})
