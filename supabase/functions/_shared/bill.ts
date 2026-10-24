/**
 * Bill normalization shared by the website assistant and the /book function.
 * No runtime imports: this file runs in Node and in Supabase Edge Functions.
 *
 * The model call stays in server/extract.ts. /book uploads the file and asks
 * that same route to read it, then runs this normalizer again before saving.
 */

export type UsagePoint = { month: string; kwh: number }

export type NormalizedBill = {
  customerName: string | null
  serviceAddress: string | null
  utility: string | null
  accountNumber: string | null
  billDate: string | null
  ratePlan: string | null
  kwhThisPeriod: number | null
  days: number | null
  kwhSameMonthLastYear: number | null
  currentCharges: number | null
  totalDue: number | null
  pastDue: number | null
  esiid: string | null
  meterNumber: string | null
  tdu: string | null
  repPuctCertificate: string | null
  avgMonthlyKwh: number | null
  usageHistory: UsagePoint[] | null
}

export const EXTRACT_INSTRUCTIONS = `You read a residential electric bill for a solar consult. Extract only values that are printed. Use null when a value is missing, unreadable, or ambiguous. Do not calculate a solar price, savings, or incentive. Do not guess a name or address.

billDate should be YYYY-MM-DD when the bill shows a full date, otherwise the date text as printed.
kwhThisPeriod is the billed kilowatt-hours for the current period, not a daily average.
days is the number of days in that billing period.
currentCharges and totalDue and pastDue are dollar amounts as printed, without a currency symbol.
accountNumber is the utility account number as printed.
esiid is the ESI ID (Electric Service Identifier) as printed. Return the digits you can see, including spaces or dashes if they are printed. Use null if it is not on the bill.
meterNumber is the meter number as printed.
tdu is the transmission and distribution utility (for example CenterPoint, Oncor, AEP Texas, or TNMP) when the bill labels it. It is not the retail electric provider. If the bill only names one utility, put that name in utility and use null for tdu unless a TDU is labeled.
repPuctCertificate is the retail electric provider's PUCT certificate number as printed. Use null if it is not printed.
avgMonthlyKwh is the average monthly kilowatt-hours only when that average is printed. Do not calculate it from the usage chart or from kwhThisPeriod.
usageHistory is the month-by-month usage read from the chart's labeled values only. Each item is an object { "month": "YYYY-MM", "kwh": number }. Put the oldest month first. Use null when there is no usage chart or the month labels and kWh values cannot both be read. Do not invent months and do not guess unlabeled bar heights.`

function clip(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function bounded(value: number | null, min: number, max: number): number | null {
  if (value == null) return null
  if (value < min || value > max) return null
  return value
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10
}

/** Digits only, and only when the result is a 17–22 digit ESI ID. */
export function normalizeEsiid(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const digits = value.replace(/\D/g, '')
  if (digits.length < 17 || digits.length > 22) return null
  return digits
}

function normalizeMeter(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[^A-Za-z0-9-]/g, '')
  if (!cleaned) return null
  return cleaned.slice(0, 40)
}

/** PUCT certificate numbers are short digit strings. A longer grab is the wrong field. */
function normalizeCertificate(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const digits = String(value).replace(/\D/g, '')
  if (digits.length < 4 || digits.length > 12) return null
  return digits
}

function usageMonth(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (year < 1990 || year > 2100 || month < 1 || month > 12) return null
  return `${match[1]}-${match[2]}`
}

function normalizeUsage(value: unknown): UsagePoint[] | null {
  if (!Array.isArray(value)) return null
  const byMonth = new Map<string, number>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const month = usageMonth(record.month)
    const kwh = bounded(numberOrNull(record.kwh), 0, 100000)
    if (!month || kwh == null) continue
    byMonth.set(month, roundTenth(kwh))
  }
  if (byMonth.size === 0) return null
  const points = [...byMonth.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
    .map(([month, kwh]) => ({ month, kwh }))
  return points.length > 36 ? points.slice(-36) : points
}

export function normalizeBill(raw: unknown): NormalizedBill {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const billDate = clip(source.billDate, 40)
  const isoDate = billDate?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const slashDate = billDate?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  let date: string | null = billDate
  if (isoDate) date = `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`
  else if (slashDate) {
    date = `${slashDate[3]}-${slashDate[1].padStart(2, '0')}-${slashDate[2].padStart(2, '0')}`
  }
  const avg = bounded(numberOrNull(source.avgMonthlyKwh), 0, 100000)
  return {
    customerName: clip(source.customerName, 120),
    serviceAddress: clip(source.serviceAddress, 240),
    utility: clip(source.utility, 80),
    accountNumber: clip(typeof source.accountNumber === 'string' ? source.accountNumber.replace(/\s+/g, '') : source.accountNumber, 40),
    billDate: date,
    ratePlan: clip(source.ratePlan, 40),
    kwhThisPeriod: bounded(numberOrNull(source.kwhThisPeriod), 0, 100000),
    days: bounded(numberOrNull(source.days), 1, 400),
    kwhSameMonthLastYear: bounded(numberOrNull(source.kwhSameMonthLastYear), 0, 100000),
    currentCharges: bounded(numberOrNull(source.currentCharges), -100000, 1000000),
    totalDue: bounded(numberOrNull(source.totalDue), -100000, 1000000),
    pastDue: bounded(numberOrNull(source.pastDue), -100000, 1000000),
    esiid: normalizeEsiid(source.esiid),
    meterNumber: normalizeMeter(source.meterNumber),
    tdu: clip(source.tdu, 80),
    repPuctCertificate: normalizeCertificate(source.repPuctCertificate),
    avgMonthlyKwh: avg == null ? null : roundTenth(avg),
    usageHistory: normalizeUsage(source.usageHistory),
  }
}

/** The website extractor returns `{ fields }`. Anything else is a failed read. */
export function fieldsFromExtractPayload(payload: unknown): NormalizedBill | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('fields' in payload)) return null
  return normalizeBill((payload as { fields: unknown }).fields)
}

/** Best single dollar amount for a lead: total due when printed, otherwise current charges. */
export function billAmount(bill: Pick<NormalizedBill, 'totalDue' | 'currentCharges'> | null | undefined): number | null {
  if (!bill) return null
  if (bill.totalDue != null) return bill.totalDue
  return bill.currentCharges
}
