import { generateText, Output } from 'ai'
import { z } from 'zod'
import { EMPTY_BILL, type BillFields } from '../shared/types'
import { assistantModel, mockAiEnabled } from './prompt'

const billSchema = z.object({
  customerName: z.string().nullable(),
  serviceAddress: z.string().nullable(),
  utility: z.string().nullable(),
  accountNumber: z.string().nullable(),
  billDate: z.string().nullable(),
  ratePlan: z.string().nullable(),
  kwhThisPeriod: z.number().nullable(),
  days: z.number().nullable(),
  kwhSameMonthLastYear: z.number().nullable(),
  currentCharges: z.number().nullable(),
  totalDue: z.number().nullable(),
  pastDue: z.number().nullable(),
})

const EXTRACT_INSTRUCTIONS = `You read a residential electric bill for a solar consult. Extract only values that are printed. Use null when a value is missing, unreadable, or ambiguous. Do not calculate a solar price, savings, or incentive. Do not guess a name or address.

billDate should be YYYY-MM-DD when the bill shows a full date, otherwise the date text as printed.
kwhThisPeriod is the billed kilowatt-hours for the current period, not a daily average.
days is the number of days in that billing period.
currentCharges and totalDue and pastDue are dollar amounts as printed, without a currency symbol.
accountNumber is the utility account number as printed.`

export const MOCK_BILL: BillFields = {
  customerName: 'Alex Morgan',
  serviceAddress: '456 Oak Lane, Houston, TX 77008',
  utility: 'Entergy Texas',
  accountNumber: '100200300',
  billDate: '2026-09-20',
  ratePlan: 'RS',
  kwhThisPeriod: 1100,
  days: 30,
  kwhSameMonthLastYear: 980,
  currentCharges: 168.4,
  totalDue: 168.4,
  pastDue: 0,
}

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

export function normalizeBill(raw: unknown): BillFields {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const billDate = clip(source.billDate, 40)
  const isoDate = billDate?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const slashDate = billDate?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  let date: string | null = billDate
  if (isoDate) date = `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`
  else if (slashDate) {
    date = `${slashDate[3]}-${slashDate[1].padStart(2, '0')}-${slashDate[2].padStart(2, '0')}`
  }
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
  }
}

async function defaultGenerate(bytes: Uint8Array, mediaType: string): Promise<unknown> {
  const filePart =
    mediaType === 'application/pdf'
      ? ({ type: 'file', data: bytes, mediaType } as const)
      : ({ type: 'image', image: bytes, mediaType } as const)
  const result = await generateText({
    model: assistantModel(),
    instructions: EXTRACT_INSTRUCTIONS,
    maxOutputTokens: 800,
    temperature: 0,
    maxRetries: 1,
    output: Output.object({ schema: billSchema }),
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Extract the electric bill fields.' }, filePart],
      },
    ],
  })
  return result.output
}

export async function extractBill(
  bytes: Uint8Array,
  mediaType: string,
  generate: (bytes: Uint8Array, mediaType: string) => Promise<unknown> = defaultGenerate,
): Promise<BillFields> {
  if (mockAiEnabled()) return { ...MOCK_BILL }
  try {
    const output = await generate(bytes, mediaType)
    if (!output) return { ...EMPTY_BILL }
    return normalizeBill(output)
  } catch (error) {
    console.error('bill_extract_failed', error instanceof Error ? error.name : 'unknown')
    return { ...EMPTY_BILL }
  }
}
