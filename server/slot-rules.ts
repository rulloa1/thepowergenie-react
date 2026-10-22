export type SlotRules = {
  timeZone: string
  weekdayStartHour: number
  weekdayEndHour: number
  saturdayStartHour: number
  saturdayEndHour: number
  durationMinutes: number
  horizonDays: number
  minLeadHours: number
  /** 0 = Sunday … 6 = Saturday. Saturday uses the Saturday hours. */
  openWeekdays: number[]
}

type Env = Record<string, string | undefined>

function integer(env: Env, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key]
  if (raw == null || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${key}`)
  }
  return value
}

export function loadSlotRules(env: Env = process.env): SlotRules {
  const openRaw = env.SLOT_OPEN_WEEKDAYS
  let openWeekdays = [1, 2, 3, 4, 5, 6]
  if (openRaw && openRaw.trim()) {
    openWeekdays = openRaw.split(',').map(part => Number(part.trim()))
    if (openWeekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new Error('Invalid SLOT_OPEN_WEEKDAYS')
    }
  }
  const timeZone = (env.SLOT_TIMEZONE || 'America/Chicago').trim() || 'America/Chicago'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
  } catch {
    throw new Error('Invalid SLOT_TIMEZONE')
  }
  const rules: SlotRules = {
    timeZone,
    weekdayStartHour: integer(env, 'SLOT_WEEKDAY_START', 9, 0, 23),
    weekdayEndHour: integer(env, 'SLOT_WEEKDAY_END', 17, 1, 24),
    saturdayStartHour: integer(env, 'SLOT_SATURDAY_START', 10, 0, 23),
    saturdayEndHour: integer(env, 'SLOT_SATURDAY_END', 14, 1, 24),
    durationMinutes: integer(env, 'SLOT_DURATION_MINUTES', 120, 30, 240),
    horizonDays: integer(env, 'SLOT_HORIZON_DAYS', 14, 1, 45),
    minLeadHours: integer(env, 'SLOT_MIN_LEAD_HOURS', 2, 0, 168),
    openWeekdays,
  }
  if (rules.weekdayStartHour >= rules.weekdayEndHour) throw new Error('Invalid weekday hours')
  if (rules.saturdayStartHour >= rules.saturdayEndHour) throw new Error('Invalid Saturday hours')
  return rules
}
