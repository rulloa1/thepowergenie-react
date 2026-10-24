/** Shared by the browser widget and the server routes. No secrets. */

export const TCPA_VERSION = 'tcpa-2026-10-22'

export const TCPA_TEXT =
  'I agree that The Power Genie and Sunrun consultant Horace Lawrence may call, text, and email me about this solar inquiry, including with autodialed or prerecorded messages. Consent is not required to purchase anything. Message and data rates may apply, and I can opt out later.'

export const REFERRAL_SOURCES = ['celebrity-solar', 'hip-hop-solar', 'gas-genie'] as const

export type ReferralSource = (typeof REFERRAL_SOURCES)[number]

/** One labeled point from a bill's usage chart. `month` is YYYY-MM. */
export type UsageMonth = {
  month: string
  kwh: number
}

export type BillFields = {
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
  /** ESI ID, digits only, 17–22 characters. Null when it isn't printed or doesn't fit. */
  esiid: string | null
  meterNumber: string | null
  /** Transmission and distribution utility, when the bill labels it separately. */
  tdu: string | null
  /** Retail provider PUCT certificate number, digits only. */
  repPuctCertificate: string | null
  /** Printed average monthly kWh. Not calculated from the chart. */
  avgMonthlyKwh: number | null
  /** Oldest month first. Null when the chart isn't printed or its labels can't be read. */
  usageHistory: UsageMonth[] | null
}

export const EMPTY_BILL: BillFields = {
  customerName: null,
  serviceAddress: null,
  utility: null,
  accountNumber: null,
  billDate: null,
  ratePlan: null,
  kwhThisPeriod: null,
  days: null,
  kwhSameMonthLastYear: null,
  currentCharges: null,
  totalDue: null,
  pastDue: null,
  esiid: null,
  meterNumber: null,
  tdu: null,
  repPuctCertificate: null,
  avgMonthlyKwh: null,
  usageHistory: null,
}

export type Slot = {
  /** Slot start in America/Chicago, with a numeric offset. This is what we store. */
  start: string
  day: string
  time: string
  label: string
}

export type LeadPayload = {
  clientRequestId: string
  pg_leave_blank?: string
  consent: boolean
  name: string
  phone: string
  email: string
  serviceAddress: string
  utility: string
  preferredWindows?: string
  slotStart: string
  referralSource?: string | null
  receipt?: string | null
  bill?: Partial<BillFields> | null
}

export type Confirmation = {
  id: string
  name: string
  slotLabel: string
  phone: string
  email: string
  billAttached: boolean
}

export const MAX_BILL_BYTES = 10 * 1024 * 1024
