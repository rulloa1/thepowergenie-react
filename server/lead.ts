import { randomUUID } from 'node:crypto'
import { TCPA_VERSION, type BillFields, type Confirmation, type LeadPayload, type Slot } from '../shared/types'
import { HttpError, honeypotTripped, isRecord } from './http'
import { loadSlotRules } from './slot-rules'
import { chicagoDate, listSlots } from './slots'
import { assertBillBytes } from './files'
import { insertRow, downloadObject, moveObject, takenAppointments } from './supabase'
import { openReceipt, type UploadReceipt } from './receipt'

/**
 * Hub assumptions (schema in powergenie-hub-schema.sql):
 *
 * - The pipeline label "1 - Bill Received" is stored as `bill_received`.
 *   That is the first value allowed by the stage check. There is no earlier
 *   stage, so a consult booked without a bill still uses `bill_received`.
 *   The activity row says whether a bill file was attached.
 * - `acknowledged = 0` leaves the lead unacknowledged for Horace.
 * - `appointment_date` is the slot start as an ISO string with the Chicago
 *   offset, for example 2026-10-27T10:00:00-05:00. The column is text.
 * - `next_step` is exactly "Horace: run savings calc".
 *   `next_step_due` is the Chicago calendar date of that slot.
 * - `date_sent_to_horace` and `logged_on` are that Chicago calendar date
 *   (YYYY-MM-DD). The website delivers the lead straight into Horace's queue.
 * - `created_by`, `actor_id`, and `uploaded_by` are null because the visitor
 *   is not a hub user. `actor_name` is "Website assistant".
 * - Phone, email, TCPA consent, and preferred windows have no columns, so
 *   they go in `notes`. Chat transcripts are not stored.
 * - `avg_kwh_per_day` and `est_cents_per_kwh` are derived only when the bill
 *   itself has the inputs. They are not a solar quote.
 * - Files live in the private `powergenie` bucket. The link is a
 *   `powergenie_files` row with category `light_bill` and `storage_path`
 *   `customers/{customerId}/light_bill/{fileId}-{fileName}`. No public URL.
 * - Primary keys are text. Website rows use the client request id so a
 *   double-click does not create a second lead.
 * - Slot holds are best-effort reads of `appointment_date`. The schema has
 *   no unique constraint on that column.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type PreparedLead = {
  customer: Record<string, unknown>
  activity: Record<string, unknown>
  file: Record<string, unknown> | null
  confirmation: Confirmation
  pendingPath: string | null
  finalPath: string | null
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function optionalBill(value: unknown): Partial<BillFields> {
  if (!isRecord(value)) return {}
  return value as Partial<BillFields>
}

function digits(value: string): string {
  return value.replace(/\D/g, '')
}

function money(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100) / 100
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ''))
    if (Number.isFinite(parsed)) return Math.round(parsed * 100) / 100
  }
  return null
}

function quantity(value: unknown, max: number): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) return null
  return parsed
}

export function buildLeadRecords(input: {
  clientRequestId: string
  name: string
  phone: string
  email: string
  serviceAddress: string
  utility: string
  preferredWindows: string
  referralSource: string | null
  slot: Slot
  bill: Partial<BillFields>
  receipt: UploadReceipt | null
  now: Date
  timeZone: string
}): PreparedLead {
  const bill = input.bill
  const kwh = quantity(bill.kwhThisPeriod, 100000)
  const daysRaw = quantity(bill.days, 400)
  const days = daysRaw == null ? null : Math.round(daysRaw)
  const current = money(bill.currentCharges)
  const avg = kwh != null && days != null && days > 0 ? Math.round((kwh / days) * 10) / 10 : null
  const cents = kwh != null && kwh > 0 && current != null && current > 0 ? Math.round((current / kwh) * 100 * 1000) / 1000 : null
  const loggedOn = chicagoDate(input.now, input.timeZone)
  const createdAt = input.now.toISOString()
  const customerId = input.clientRequestId
  const fileId = `${customerId}-bill`
  const finalPath = input.receipt ? `customers/${customerId}/light_bill/${fileId}-${input.receipt.fileName}` : null
  const billName = text(bill.customerName, 120)
  const billAddress = text(bill.serviceAddress, 240)
  const notes = [
    'Website assistant lead',
    `Phone: ${input.phone}`,
    `Email: ${input.email}`,
    input.preferredWindows ? `Preferred windows: ${input.preferredWindows}` : null,
    input.referralSource ? `Referral source: ${input.referralSource}` : null,
    billName && billName.toLowerCase() !== input.name.toLowerCase() ? `Name on bill: ${billName}` : null,
    billAddress && billAddress.toLowerCase() !== input.serviceAddress.toLowerCase() ? `Address on bill: ${billAddress}` : null,
    'TCPA consent: yes',
    `Consent version: ${TCPA_VERSION}`,
    `Consent at: ${createdAt}`,
    input.receipt ? 'Bill: attached' : 'Bill: not attached',
  ]
    .filter(Boolean)
    .join('\n')

  const customer: Record<string, unknown> = {
    id: customerId,
    created_at: createdAt,
    logged_on: loggedOn,
    created_by: null,
    customer_name: input.name,
    service_address: input.serviceAddress,
    utility: input.utility || 'Not provided',
    account_number: text(bill.accountNumber, 40) || null,
    bill_date: text(bill.billDate, 40) || null,
    rate_plan: text(bill.ratePlan, 40) || null,
    kwh_this_period: kwh,
    days: days != null && days > 0 ? days : null,
    avg_kwh_per_day: avg,
    kwh_same_month_last_year: quantity(bill.kwhSameMonthLastYear, 100000),
    current_charges: current,
    total_due: money(bill.totalDue),
    past_due: money(bill.pastDue),
    est_cents_per_kwh: cents,
    notes,
    date_sent_to_horace: loggedOn,
    stage: 'bill_received',
    acknowledged: 0,
    acknowledged_at: null,
    acknowledged_by: null,
    date_contacted: null,
    est_monthly_savings: null,
    est_lifetime_savings: null,
    system_size_kw: null,
    panel_count: null,
    proposal_sent_date: null,
    appointment_date: input.slot.start,
    next_step: 'Horace: run savings calc',
    next_step_due: input.slot.start.slice(0, 10),
    horace_notes: null,
    updated_at: createdAt,
  }

  const billPhrase = input.receipt ? 'Bill attached.' : 'No bill attached yet.'
  const activity: Record<string, unknown> = {
    id: `${customerId}-activity`,
    customer_id: customerId,
    actor_id: null,
    actor_name: 'Website assistant',
    type: 'website_lead',
    message: `New lead from the website assistant. ${billPhrase} Consult booked for ${input.slot.label}. TCPA consent recorded.`,
    created_at: createdAt,
  }

  const file = input.receipt && finalPath
    ? {
        id: fileId,
        customer_id: customerId,
        uploaded_by: null,
        uploader_name: input.name,
        category: 'light_bill',
        file_name: input.receipt.fileName,
        mime_type: input.receipt.mimeType,
        size_bytes: 0,
        storage_path: finalPath,
        created_at: createdAt,
      }
    : null

  return {
    customer,
    activity,
    file,
    pendingPath: input.receipt?.path ?? null,
    finalPath,
    confirmation: {
      id: customerId,
      name: input.name,
      slotLabel: input.slot.label,
      phone: input.phone,
      email: input.email,
      billAttached: Boolean(input.receipt),
    },
  }
}

export function parseLead(body: unknown, slots: Slot[], now = new Date()): PreparedLead {
  if (!isRecord(body)) throw new HttpError(400, 'Invalid request.')
  const payload = body as Partial<LeadPayload>
  if (honeypotTripped(payload.pg_leave_blank)) {
    throw new HttpError(204, 'honeypot')
  }
  if (payload.consent !== true) {
    throw new HttpError(400, 'Please agree to be contacted before booking.')
  }
  const clientRequestId = text(payload.clientRequestId, 80)
  if (!UUID.test(clientRequestId)) throw new HttpError(400, 'Please try that booking again.')
  const name = text(payload.name, 120)
  const phone = text(payload.phone, 40)
  const email = text(payload.email, 120).toLowerCase()
  const serviceAddress = text(payload.serviceAddress, 240)
  const utility = text(payload.utility, 80) || 'Not provided'
  const preferredWindows = text(payload.preferredWindows, 400)
  if (name.length < 2) throw new HttpError(400, 'Please enter your name.')
  const phoneDigits = digits(phone)
  if (phoneDigits.length < 10 || phoneDigits.length > 15) throw new HttpError(400, 'Please enter a phone number.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Please enter an email address.')
  if (serviceAddress.length < 5) throw new HttpError(400, 'Please enter the service address.')
  const slot = slots.find(item => item.start === payload.slotStart)
  if (!slot) throw new HttpError(400, 'Please pick an open time.')
  const referralRaw = text(payload.referralSource, 40)
  const referralSource = referralRaw === 'celebrity-solar' || referralRaw === 'hip-hop-solar' || referralRaw === 'gas-genie' ? referralRaw : null
  const rules = loadSlotRules()
  return buildLeadRecords({
    clientRequestId,
    name,
    phone,
    email,
    serviceAddress,
    utility,
    preferredWindows,
    referralSource,
    slot,
    bill: optionalBill(payload.bill),
    receipt: typeof payload.receipt === 'string' && payload.receipt ? openReceipt(payload.receipt) : null,
    now,
    timeZone: rules.timeZone,
  })
}

async function placeBill(pendingPath: string, finalPath: string, mimeType: string): Promise<number> {
  let bytes: Uint8Array
  let fromPending = true
  try {
    bytes = await downloadObject(pendingPath)
  } catch (error) {
    if (!(error instanceof HttpError)) throw error
    bytes = await downloadObject(finalPath)
    fromPending = false
  }
  assertBillBytes(bytes, mimeType)
  if (fromPending) await moveObject(pendingPath, finalPath)
  return bytes.byteLength
}

export async function saveLead(body: unknown, now = new Date()): Promise<Confirmation | 'honeypot'> {
  const rules = loadSlotRules()
  let prepared: PreparedLead
  try {
    const offered = listSlots(rules, now, new Set())
    prepared = parseLead(body, offered, now)
  } catch (error) {
    if (error instanceof HttpError && error.status === 204) return 'honeypot'
    throw error
  }
  const today = chicagoDate(now, rules.timeZone)
  const horizon = new Date(now.getTime() + (rules.horizonDays + 2) * 24 * 60 * 60 * 1000)
  const taken = await takenAppointments(today, chicagoDate(horizon, rules.timeZone))
  const slotStart = String(prepared.customer.appointment_date)
  const holder = taken.get(slotStart)
  if (holder && holder !== prepared.customer.id) {
    throw new HttpError(409, 'That time was just taken. Please pick another.')
  }
  if (prepared.pendingPath && prepared.finalPath && prepared.file) {
    prepared.file.size_bytes = await placeBill(prepared.pendingPath, prepared.finalPath, String(prepared.file.mime_type))
  }
  await insertRow('powergenie_customers', prepared.customer)
  if (prepared.file) await insertRow('powergenie_files', prepared.file)
  await insertRow('powergenie_activity', prepared.activity)
  return prepared.confirmation
}

export function newId(): string {
  return randomUUID()
}
