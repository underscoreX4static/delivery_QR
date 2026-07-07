import { addMinutes, startOfMonth, startOfWeek } from 'date-fns'

// Brisbane is UTC+10 year-round — Queensland does not observe daylight saving.
export const BRISBANE_OFFSET_MINUTES = 10 * 60

// Store-open/slot-generation logic used to live here but has moved to
// lib/slots.ts, which supports per-weekday hours and a manual force-open/
// closed override — this file keeps only the general Brisbane time helpers.

/** Converts a real UTC instant into a Date whose UTC getters read as Brisbane wall-clock time. */
function toBrisbaneWallClock(utcDate: Date): Date {
  return new Date(utcDate.getTime() + BRISBANE_OFFSET_MINUTES * 60_000)
}

/** Converts a Brisbane wall-clock Date (as produced above) back into a real UTC instant. */
function fromBrisbaneWallClock(wallClockDate: Date): Date {
  return new Date(wallClockDate.getTime() - BRISBANE_OFFSET_MINUTES * 60_000)
}

function startOfBrisbaneDay(wallClockDate: Date): Date {
  const d = new Date(wallClockDate)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/** UTC instant bounds of "today" in Brisbane wall-clock time — used for daily driver settlements. */
export function getBrisbaneDayBounds(now: Date = new Date()): { start: Date; end: Date } {
  const wallClockNow = toBrisbaneWallClock(now)
  const dayStart = startOfBrisbaneDay(wallClockNow)
  const dayEnd = addMinutes(dayStart, 24 * 60)
  return { start: fromBrisbaneWallClock(dayStart), end: fromBrisbaneWallClock(dayEnd) }
}

/**
 * YYYY-MM-DD date string for "today" in Brisbane, for settlements.period_start/end
 * columns. Uses UTC getters deliberately rather than date-fns' format() (which reads
 * the process's own system timezone) — this must give the same answer regardless of
 * what TZ the server happens to run under.
 */
export function getBrisbaneDateString(now: Date = new Date()): string {
  const wallClock = toBrisbaneWallClock(now)
  const year = wallClock.getUTCFullYear()
  const month = String(wallClock.getUTCMonth() + 1).padStart(2, '0')
  const day = String(wallClock.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export type EarningsPeriod = 'today' | 'week' | 'month' | 'all'

/** Start-of-period UTC instant in Brisbane wall-clock terms, for the admin earnings tabs. */
export function getBrisbanePeriodStart(period: EarningsPeriod, now: Date = new Date()): Date | null {
  if (period === 'all') return null

  const wallClockNow = toBrisbaneWallClock(now)
  if (period === 'today') return fromBrisbaneWallClock(startOfBrisbaneDay(wallClockNow))
  if (period === 'week') return fromBrisbaneWallClock(startOfWeek(wallClockNow, { weekStartsOn: 1 }))
  return fromBrisbaneWallClock(startOfMonth(wallClockNow))
}

/** Brisbane-local hour-of-day (0-23) and day-of-week (0=Sunday) for a UTC instant — used for the schedule heatmap. */
export function getBrisbaneHourAndWeekday(utcDate: Date | string): { hour: number; weekday: number } {
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate
  const wallClock = toBrisbaneWallClock(date)
  return { hour: wallClock.getUTCHours(), weekday: wallClock.getUTCDay() }
}
