import { generateText, Output } from 'ai'
import { z } from 'zod'
import { EXTRACT_INSTRUCTIONS, normalizeBill as normalizeShared } from '../supabase/functions/_shared/bill.js'
import { EMPTY_BILL, type BillFields } from '../shared/types.js'
import { billImageForModel } from './bill-image.js'
import { assistantModel, mockAiEnabled } from './prompt.js'

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
  esiid: z.string().nullable(),
  meterNumber: z.string().nullable(),
  tdu: z.string().nullable(),
  repPuctCertificate: z.string().nullable(),
  avgMonthlyKwh: z.number().nullable(),
  usageHistory: z.array(z.object({
    month: z.string(),
    kwh: z.number(),
  })).nullable(),
})

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
  esiid: '10443720012345678',
  meterNumber: 'A12345678',
  tdu: 'CenterPoint Energy',
  repPuctCertificate: '10094',
  avgMonthlyKwh: 1050,
  usageHistory: [
    { month: '2026-04', kwh: 880 },
    { month: '2026-05', kwh: 1020 },
    { month: '2026-06', kwh: 1400 },
    { month: '2026-07', kwh: 1550 },
    { month: '2026-08', kwh: 1480 },
    { month: '2026-09', kwh: 1100 },
  ],
}

export function normalizeBill(raw: unknown): BillFields {
  return normalizeShared(raw)
}

async function defaultGenerate(bytes: Uint8Array, mediaType: string): Promise<unknown> {
  const filePart =
    mediaType === 'application/pdf'
      ? ({ type: 'file', data: bytes, mediaType } as const)
      : ({ type: 'image', image: bytes, mediaType } as const)
  const result = await generateText({
    model: assistantModel(),
    instructions: EXTRACT_INSTRUCTIONS,
    maxOutputTokens: 1500,
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
  let prepared: { bytes: Uint8Array; mediaType: string }
  try {
    prepared = await billImageForModel(bytes, mediaType)
  } catch (error) {
    console.error('bill_extract_failed', error instanceof Error ? error.name : 'unknown')
    return { ...EMPTY_BILL }
  }
  if (mockAiEnabled()) return { ...MOCK_BILL }
  try {
    const output = await generate(prepared.bytes, prepared.mediaType)
    if (!output) return { ...EMPTY_BILL }
    return normalizeBill(output)
  } catch (error) {
    console.error('bill_extract_failed', error instanceof Error ? error.name : 'unknown')
    return { ...EMPTY_BILL }
  }
}
