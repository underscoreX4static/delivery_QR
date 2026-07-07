import { supabaseAdmin } from '@/lib/supabase'

// Brisbane is UTC+10 year-round — Queensland does not observe daylight saving,
// so a fixed offset is correct here (a real DST-observing timezone would need
// a proper tz library instead).
export const STORE_OFFSET_MS = 10 * 60 * 60 * 1000

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const SLOT_MINUTES = 30
const LEAD_MS = 30 * 60 * 1000 // minimum notice before a slot can be booked
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000 // short enough that an admin's hours change lands quickly

export interface DayHours {
  open: number // local hour, 0-23
  close: number // local hour, 1-24 ("24" = midnight)
}

export type WeekHours = Record<number, DayHours> // 0 = Sunday .. 6 = Saturday

const DEFAULT_DAY_HOURS: DayHours = { open: 10, close: 24 }
const DEFAULT_WEEK_HOURS: WeekHours = {
  0: DEFAULT_DAY_HOURS,
  1: DEFAULT_DAY_HOURS,
  2: DEFAULT_DAY_HOURS,
  3: DEFAULT_DAY_HOURS,
  4: DEFAULT_DAY_HOURS,
  5: DEFAULT_DAY_HOURS,
  6: DEFAULT_DAY_HOURS,
}

export interface Slot {
  label: string // "Today 6:00 PM" (suffixed " — full" when taken)
  value: string // real UTC ISO instant — stored as-is in orders.scheduled_at
  localHour: number
  localMin: number
  dayOffset: 0 | 1
  taken: boolean
}

export interface SlotSettings {
  weekHours: WeekHours
  forceStatus: 'open' | 'closed' | null
}

// Module-level cache with a short TTL — slot generation would otherwise hit
// the DB on every request, but a long TTL would delay an admin's hours change
// from taking effect.
let cachedSettings: { value: SlotSettings; fetchedAt: number } | null = null

export async function getSlotSettings(): Promise<SlotSettings> {
  if (cachedSettings && Date.now() - cachedSettings.fetchedAt < SETTINGS_CACHE_TTL_MS) {
    return cachedSettings.value
  }

  const { data } = await supabaseAdmin
    .from('settings')
    .select('key, value')
    .in('key', ['store_hours', 'store_force_status'])

  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))

  let weekHours = DEFAULT_WEEK_HOURS
  if (map.store_hours) {
    try {
      weekHours = { ...DEFAULT_WEEK_HOURS, ...JSON.parse(map.store_hours) }
    } catch {
      weekHours = DEFAULT_WEEK_HOURS
    }
  }

  const forceStatus = map.store_force_status === 'open' || map.store_force_status === 'closed' ? map.store_force_status : null

  const value: SlotSettings = { weekHours, forceStatus }
  cachedSettings = { value, fetchedAt: Date.now() }
  return value
}

/** Call after an admin edits store_hours/store_force_status so the change is visible immediately. */
export function invalidateSlotSettingsCache() {
  cachedSettings = null
}

function localComponents(utc: Date) {
  const t = new Date(utc.getTime() + STORE_OFFSET_MS)
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth(),
    day: t.getUTCDate(),
    weekday: t.getUTCDay(),
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
  }
}

function localToUTC(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month, day, hour, minute) - STORE_OFFSET_MS)
}

function hoursFor(weekHours: WeekHours, weekday: number): DayHours {
  return weekHours[weekday] ?? DEFAULT_DAY_HOURS
}

export function isStoreOpenNow(settings: SlotSettings, now: Date = new Date()): boolean {
  if (settings.forceStatus === 'open') return true
  if (settings.forceStatus === 'closed') return false

  const c = localComponents(now)
  const hours = hoursFor(settings.weekHours, c.weekday)
  const currentMinutes = c.hour * 60 + c.minute
  return currentMinutes >= hours.open * 60 && currentMinutes < hours.close * 60
}

/** Minutes until closing, or null if closed / status is forced (no predictable countdown). */
export function getMinutesUntilClose(settings: SlotSettings, now: Date = new Date()): number | null {
  if (settings.forceStatus) return null
  if (!isStoreOpenNow(settings, now)) return null

  const c = localComponents(now)
  const hours = hoursFor(settings.weekHours, c.weekday)
  return hours.close * 60 - (c.hour * 60 + c.minute)
}

/** Minutes until the next opening, or null if already open / status is forced. */
export function getMinutesUntilOpen(settings: SlotSettings, now: Date = new Date()): number | null {
  if (settings.forceStatus) return null
  if (isStoreOpenNow(settings, now)) return null

  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const refUtc = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000)
    const c = localComponents(refUtc)
    const hours = hoursFor(settings.weekHours, c.weekday)
    const openUtc = localToUTC(c.year, c.month, c.day, hours.open, 0)
    if (openUtc > now) return Math.round((openUtc.getTime() - now.getTime()) / 60_000)
  }
  return null
}

/** Human label for the closed-store banner: "today at 6:00 PM" / "tomorrow at 10:00 AM" / "soon". */
export function getNextOpenLabel(settings: SlotSettings, now: Date = new Date()): string {
  // A manual override is unpredictable by definition — the natural weekly
  // hours don't tell you anything true about when an admin will flip it back.
  if (settings.forceStatus === 'closed') return 'soon'

  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const refUtc = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000)
    const c = localComponents(refUtc)
    const hours = hoursFor(settings.weekHours, c.weekday)
    const openUtc = localToUTC(c.year, c.month, c.day, hours.open, 0)
    if (openUtc > now) {
      const time = formatLocalTime(openUtc.toISOString())
      if (dayOffset === 0) return `today at ${time}`
      if (dayOffset === 1) return `tomorrow at ${time}`
      return `${WEEKDAY_NAMES[c.weekday]} at ${time}`
    }
  }
  return 'soon'
}

/**
 * Local-time display string for a real UTC ISO instant, e.g. "6:00 PM".
 * Uses UTC getters deliberately (never date-fns' format(), which reads the
 * process's own system timezone) — correctness here must not depend on
 * whatever TZ the server happens to run under.
 */
export function formatLocalTime(utcIso: string): string {
  const d = new Date(new Date(utcIso).getTime() + STORE_OFFSET_MS)
  const hour = d.getUTCHours()
  const minute = d.getUTCMinutes()
  const period = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${minute.toString().padStart(2, '0')} ${period}`
}

/**
 * Rounds a UTC ISO instant down to its half-hour slot boundary with zero
 * seconds/ms. Used both when building the taken-slot set and when checking
 * an incoming booking request, so residual seconds from any client-side
 * serialization can never cause a false "slot is free" mismatch.
 */
export function normalizeSlotIso(iso: string): string {
  const d = new Date(iso)
  d.setUTCMinutes(d.getUTCMinutes() < 30 ? 0 : 30)
  d.setUTCSeconds(0)
  d.setUTCMilliseconds(0)
  return d.toISOString()
}

/**
 * Generates bookable 30-min slots for today + tomorrow, marking any that
 * collide with an already-booked order as taken. `takenUtcIsos` should come
 * from active (non-cancelled) orders' scheduled_at values.
 */
export function buildSlots(now: Date, weekHours: WeekHours, takenUtcIsos: string[]): Slot[] {
  const minTime = new Date(now.getTime() + LEAD_MS)

  // Normalize taken slots to exact half-hour boundaries with zero seconds/ms —
  // without this, a scheduled_at with residual seconds (e.g. from a slightly
  // imprecise client clock) would never string-match the clean ISO `value`
  // generated below, and the slot would wrongly show as free.
  const takenSet = new Set(takenUtcIsos.map(normalizeSlotIso))

  const slots: Slot[] = []
  const today = localComponents(now)

  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    const refUtc = new Date(Date.UTC(today.year, today.month, today.day + dayOffset))
    const c = localComponents(refUtc)
    const hours = hoursFor(weekHours, c.weekday)

    for (let h = hours.open; h < hours.close; h++) {
      for (const min of [0, 30]) {
        const slotUtc = localToUTC(c.year, c.month, c.day, h, min)
        if (slotUtc < minTime) continue

        const iso = slotUtc.toISOString()
        const taken = takenSet.has(iso)
        slots.push({
          label: `${dayOffset === 0 ? 'Today' : 'Tomorrow'} ${formatLocalTime(iso)}${taken ? ' — full' : ''}`,
          value: iso,
          localHour: h,
          localMin: min,
          dayOffset: dayOffset as 0 | 1,
          taken,
        })
      }
    }
  }

  return slots
}

export { SLOT_MINUTES }
