import { addMinutes, format } from 'date-fns'
import type { StoreSettings } from '@/lib/settings'

// Brisbane is UTC+10 year-round — Queensland does not observe daylight saving.
export const BRISBANE_OFFSET_MINUTES = 10 * 60

export interface TimeSlot {
  label: string // e.g. "Today 2:30 PM"
  value: string // ISO instant (UTC) suitable for orders.scheduled_at
}

/** Converts a real UTC instant into a Date whose UTC getters read as Brisbane wall-clock time. */
function toBrisbaneWallClock(utcDate: Date): Date {
  return new Date(utcDate.getTime() + BRISBANE_OFFSET_MINUTES * 60_000)
}

/** Converts a Brisbane wall-clock Date (as produced above) back into a real UTC instant. */
function fromBrisbaneWallClock(wallClockDate: Date): Date {
  return new Date(wallClockDate.getTime() - BRISBANE_OFFSET_MINUTES * 60_000)
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

function minutesOfDay(wallClockDate: Date): number {
  return wallClockDate.getUTCHours() * 60 + wallClockDate.getUTCMinutes()
}

function startOfBrisbaneDay(wallClockDate: Date): Date {
  const d = new Date(wallClockDate)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

export function isStoreOpenNow(settings: StoreSettings, now: Date = new Date()): boolean {
  if (settings.isManuallyClosed) return false

  const wallClock = toBrisbaneWallClock(now)
  const current = minutesOfDay(wallClock)
  const open = parseMinutes(settings.openTime)
  const close = parseMinutes(settings.closeTime) || 24 * 60 // "24:00" -> 1440

  return current >= open && current < close
}

/**
 * Returns 30-minute scheduled slots for the next opening window: today's
 * remaining hours if the store is still due to open/close today, otherwise
 * tomorrow's full opening window. Manual closure does not remove these —
 * only ASAP ordering is disabled while manually closed.
 */
export function getScheduledSlots(settings: StoreSettings, now: Date = new Date()): TimeSlot[] {
  const wallClockNow = toBrisbaneWallClock(now)
  const open = parseMinutes(settings.openTime)
  const close = parseMinutes(settings.closeTime) || 24 * 60
  const currentMinutes = minutesOfDay(wallClockNow)

  const isTodayStillAvailable = currentMinutes < close
  const dayStart = isTodayStillAvailable
    ? startOfBrisbaneDay(wallClockNow)
    : addMinutes(startOfBrisbaneDay(wallClockNow), 24 * 60)
  const dayLabel = isTodayStillAvailable ? 'Today' : 'Tomorrow'

  const firstSlotMinutes = isTodayStillAvailable ? Math.max(open, roundUpToHalfHour(currentMinutes)) : open

  const slots: TimeSlot[] = []
  for (let m = firstSlotMinutes; m < close; m += 30) {
    const slotWallClock = addMinutes(dayStart, m)
    const slotUtc = fromBrisbaneWallClock(slotWallClock)
    slots.push({
      label: `${dayLabel} ${format(slotWallClock, 'h:mm a')}`,
      value: slotUtc.toISOString(),
    })
  }

  return slots
}

function roundUpToHalfHour(minutes: number): number {
  return Math.ceil(minutes / 30) * 30
}

/** Formats a UTC instant as a Brisbane-local display string, e.g. for admin dashboards. */
export function formatBrisbaneTime(utcDate: Date | string, fmt = 'd MMM yyyy, h:mm a'): string {
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate
  return format(toBrisbaneWallClock(date), fmt)
}

/** UTC instant bounds of "today" in Brisbane wall-clock time — used for daily driver settlements. */
export function getBrisbaneDayBounds(now: Date = new Date()): { start: Date; end: Date } {
  const wallClockNow = toBrisbaneWallClock(now)
  const dayStart = startOfBrisbaneDay(wallClockNow)
  const dayEnd = addMinutes(dayStart, 24 * 60)
  return { start: fromBrisbaneWallClock(dayStart), end: fromBrisbaneWallClock(dayEnd) }
}

/** YYYY-MM-DD date string for "today" in Brisbane, for settlements.period_start/end columns. */
export function getBrisbaneDateString(now: Date = new Date()): string {
  return format(toBrisbaneWallClock(now), 'yyyy-MM-dd')
}
