/**
 * Sales workflow math shared by the server and the dashboard.
 *
 * Everything here is a pure function: usage in, system size and savings out.
 * Numbers are estimates for Horace to review. Sunrun's agreement sets the
 * final price, so a proposal is never built without a rate he has set.
 */

export const STAGE_ORDER = [
  'bill_received',
  'savings_calc',
  'panel_design',
  'proposal_ready',
  'presented',
  'signed',
  'site_survey',
  'permits',
  'installed',
] as const

export type WorkflowStage = (typeof STAGE_ORDER)[number] | 'lost'

export function stageIndex(stage: string | null | undefined): number {
  if (!stage) return 0
  const index = (STAGE_ORDER as readonly string[]).indexOf(stage)
  return index < 0 ? -1 : index
}

/** Pricing defaults set once in the dashboard. Horace can override per lead. */
export type PricingSettings = {
  planName: string
  /** Year-one price per kWh the system produces, in cents. Required for a proposal. */
  ppaRateCents: number | null
  /** Yearly increase of that price, in percent. Required for a proposal (0 is allowed). */
  ppaEscalatorPct: number | null
  termYears: number
  /** Used only when the bill does not show a rate. */
  utilityRateCents: number
  utilityEscalatorPct: number
  /** What the electricity plan pays for power sent back to the grid, in cents per kWh. */
  exportCreditCents: number
  /** Share of the solar the home uses itself, with and without a battery. */
  selfUsePctWithBattery: number
  selfUsePctWithoutBattery: number
  /** The bill never drops below this (delivery and base charges), in dollars a month. */
  minMonthlyBill: number
  panelWatts: number
  /** Yearly AC output per kW of panels when there is no roof data. */
  productionKwhPerKw: number
  /** Loss from the roof data's DC estimate to usable AC power, in percent. */
  dcToAcLossPct: number
  degradationPct: number
  targetOffsetPct: number
  includeBattery: boolean
  batteryName: string
  batteryMonthlyAdder: number
  advisorName: string
  advisorPhone: string
  advisorEmail: string
}

export const DEFAULT_PRICING: PricingSettings = {
  planName: 'Sunrun monthly plan',
  ppaRateCents: null,
  ppaEscalatorPct: null,
  termYears: 25,
  utilityRateCents: 15,
  utilityEscalatorPct: 3,
  exportCreditCents: 8,
  selfUsePctWithBattery: 90,
  selfUsePctWithoutBattery: 65,
  minMonthlyBill: 15,
  panelWatts: 400,
  productionKwhPerKw: 1300,
  dcToAcLossPct: 14,
  degradationPct: 0.5,
  targetOffsetPct: 100,
  includeBattery: true,
  batteryName: 'Tesla Powerwall 3',
  batteryMonthlyAdder: 0,
  advisorName: 'Horace Lawrence',
  advisorPhone: '510-241-7007',
  advisorEmail: 'horace.lawrence@sunrun.com',
}

/** Per-lead changes Horace makes. Blank fields fall back to the defaults. */
export type LeadOverrides = {
  ppaRateCents?: number | null
  ppaEscalatorPct?: number | null
  targetOffsetPct?: number | null
  panelCount?: number | null
  includeBattery?: boolean | null
  annualKwh?: number | null
}

const NUMBER_LIMITS: Partial<Record<keyof PricingSettings, [number, number]>> = {
  ppaRateCents: [1, 60],
  ppaEscalatorPct: [0, 6],
  termYears: [10, 30],
  utilityRateCents: [5, 60],
  utilityEscalatorPct: [0, 10],
  exportCreditCents: [0, 40],
  selfUsePctWithBattery: [10, 100],
  selfUsePctWithoutBattery: [10, 100],
  minMonthlyBill: [0, 100],
  panelWatts: [250, 700],
  productionKwhPerKw: [800, 2000],
  dcToAcLossPct: [0, 30],
  degradationPct: [0, 2],
  targetOffsetPct: [30, 150],
  batteryMonthlyAdder: [0, 500],
}

function finite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[$,%\s¢]/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function text(value: unknown, fallback: string, max = 80): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback
}

/** Reads stored settings, dropping anything out of range back to the default. */
export function normalizePricing(input: unknown): PricingSettings {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const out: PricingSettings = { ...DEFAULT_PRICING }
  for (const [key, [min, max]] of Object.entries(NUMBER_LIMITS) as Array<[keyof PricingSettings, [number, number]]>) {
    const value = finite(raw[key])
    if (value != null && value >= min && value <= max) {
      ;(out as Record<string, unknown>)[key] = value
    }
  }
  out.planName = text(raw.planName, DEFAULT_PRICING.planName)
  out.batteryName = text(raw.batteryName, DEFAULT_PRICING.batteryName)
  out.advisorName = text(raw.advisorName, DEFAULT_PRICING.advisorName)
  out.advisorPhone = text(raw.advisorPhone, DEFAULT_PRICING.advisorPhone, 30)
  out.advisorEmail = text(raw.advisorEmail, DEFAULT_PRICING.advisorEmail, 120)
  if (typeof raw.includeBattery === 'boolean') out.includeBattery = raw.includeBattery
  out.termYears = Math.round(out.termYears)
  return out
}

export function normalizeOverrides(input: unknown): LeadOverrides {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const out: LeadOverrides = {}
  const rate = finite(raw.ppaRateCents)
  if (rate != null && rate >= 1 && rate <= 60) out.ppaRateCents = rate
  const esc = finite(raw.ppaEscalatorPct)
  if (esc != null && esc >= 0 && esc <= 6) out.ppaEscalatorPct = esc
  const offset = finite(raw.targetOffsetPct)
  if (offset != null && offset >= 30 && offset <= 150) out.targetOffsetPct = offset
  const panels = finite(raw.panelCount)
  if (panels != null && panels >= 4 && panels <= 120) out.panelCount = Math.round(panels)
  const kwh = finite(raw.annualKwh)
  if (kwh != null && kwh >= 1000 && kwh <= 100000) out.annualKwh = Math.round(kwh)
  if (typeof raw.includeBattery === 'boolean') out.includeBattery = raw.includeBattery
  return out
}

/** Pricing for one lead: defaults with Horace's per-lead changes on top. */
export function effectivePricing(settings: PricingSettings, overrides: LeadOverrides): PricingSettings {
  return {
    ...settings,
    ppaRateCents: overrides.ppaRateCents ?? settings.ppaRateCents,
    ppaEscalatorPct: overrides.ppaEscalatorPct ?? settings.ppaEscalatorPct,
    targetOffsetPct: overrides.targetOffsetPct ?? settings.targetOffsetPct,
    includeBattery: overrides.includeBattery ?? settings.includeBattery,
  }
}

export type UsageSource =
  | 'override'
  | 'smart_meter'
  | 'bill_history'
  | 'bill_average'
  | 'bill_period'
  | 'bill_amount'
  | 'bill_range'

export type UsageEstimate = {
  annualKwh: number
  source: UsageSource
  label: string
  confident: boolean
}

export type UsageInputs = {
  kwhThisPeriod: number | null
  days: number | null
  avgMonthlyKwh: number | null
  usageHistory: Array<{ month: string; kwh: number }> | null
  totalDue: number | null
  currentCharges: number | null
  notes: string | null
  smartMeterMonthly?: Array<{ periodStart: string; kwh: number }> | null
}

/** "Electric bill: $300-$400" or "bill $250" in lead notes, as a monthly dollar amount. */
export function billHintFromNotes(notes: string | null | undefined): { low: number; high: number } | null {
  if (!notes) return null
  for (const line of notes.split(/\n/)) {
    if (!/bill/i.test(line)) continue
    const match = line.match(/\$\s*(\d[\d,]*(?:\.\d+)?)(?:\s*(?:-|–|to)\s*\$?\s*(\d[\d,]*(?:\.\d+)?))?/i)
    if (!match) continue
    const low = Number(match[1].replace(/,/g, ''))
    const high = match[2] ? Number(match[2].replace(/,/g, '')) : low
    if (Number.isFinite(low) && Number.isFinite(high) && low >= 20 && high <= 3000 && high >= low) {
      return { low, high }
    }
  }
  return null
}

function sumLastTwelve(points: Array<{ key: string; kwh: number }>): { total: number; months: number } | null {
  const clean = points
    .filter(point => Number.isFinite(point.kwh) && point.kwh > 0 && point.kwh < 20000)
    .sort((a, b) => a.key.localeCompare(b.key))
  const byKey = new Map<string, number>()
  for (const point of clean) byKey.set(point.key.slice(0, 7), point.kwh)
  const recent = [...byKey.entries()].slice(-12)
  if (recent.length < 6) return null
  const total = recent.reduce((sum, [, kwh]) => sum + kwh, 0)
  return { total: (total / recent.length) * 12, months: recent.length }
}

/**
 * Best yearly kWh from what we have, in order of trust: Horace's number,
 * Smart Meter Texas, the bill's 12-month history, the bill's average,
 * one billing period, the bill amount, then a dollar range the customer gave.
 */
export function estimateAnnualUsage(input: UsageInputs, rateCents: number, override?: number | null): UsageEstimate | null {
  if (override && override > 0) {
    return { annualKwh: Math.round(override), source: 'override', label: 'Entered by Horace', confident: true }
  }
  if (input.smartMeterMonthly?.length) {
    const year = sumLastTwelve(input.smartMeterMonthly.map(point => ({ key: point.periodStart, kwh: point.kwh })))
    if (year) {
      return { annualKwh: Math.round(year.total), source: 'smart_meter', label: `Smart Meter Texas, last ${year.months} months`, confident: true }
    }
  }
  if (input.usageHistory?.length) {
    const year = sumLastTwelve(input.usageHistory.map(point => ({ key: point.month, kwh: point.kwh })))
    if (year) {
      return { annualKwh: Math.round(year.total), source: 'bill_history', label: `Usage history on the bill, ${year.months} months`, confident: true }
    }
  }
  if (input.avgMonthlyKwh && input.avgMonthlyKwh > 50) {
    return { annualKwh: Math.round(input.avgMonthlyKwh * 12), source: 'bill_average', label: 'Average monthly use on the bill', confident: true }
  }
  if (input.kwhThisPeriod && input.kwhThisPeriod > 50) {
    const perDay = input.days && input.days >= 20 && input.days <= 40 ? input.kwhThisPeriod / input.days : input.kwhThisPeriod / 30.4
    return { annualKwh: Math.round(perDay * 365), source: 'bill_period', label: 'One billing period on the bill (season not adjusted)', confident: false }
  }
  const amount = input.currentCharges && input.currentCharges > 20 ? input.currentCharges : input.totalDue && input.totalDue > 20 ? input.totalDue : null
  if (amount) {
    return { annualKwh: Math.round((amount / (rateCents / 100)) * 12), source: 'bill_amount', label: 'Bill amount divided by the rate', confident: false }
  }
  const hint = billHintFromNotes(input.notes)
  if (hint) {
    const mid = (hint.low + hint.high) / 2
    const label = hint.low === hint.high ? `Customer's $${hint.low} monthly bill` : `Middle of the customer's $${hint.low}–$${hint.high} bill range`
    return { annualKwh: Math.round((mid / (rateCents / 100)) * 12), source: 'bill_range', label, confident: false }
  }
  return null
}

/** The bill's own all-in rate (charges ÷ kWh) when it looks sane, else the default. */
export function utilityRate(kwhThisPeriod: number | null, currentCharges: number | null, fallbackCents: number): { cents: number; fromBill: boolean } {
  if (kwhThisPeriod && kwhThisPeriod > 50 && currentCharges && currentCharges > 10) {
    const cents = (currentCharges / kwhThisPeriod) * 100
    if (cents >= 6 && cents <= 45) return { cents: Math.round(cents * 10) / 10, fromBill: true }
  }
  return { cents: fallbackCents, fromBill: false }
}

/** Roof result the server keeps from Google's Solar API. */
export type RoofPanel = { lat: number; lng: number; orientation: 'LANDSCAPE' | 'PORTRAIT'; azimuth: number; dcKwh: number }

export type RoofDesign = {
  center: { lat: number; lng: number }
  zoom: number
  formattedAddress: string | null
  panelWidthM: number
  panelHeightM: number
  googlePanelWatts: number
  maxPanels: number
  imageryDate: string | null
  imageryQuality: string | null
  roofAreaM2: number | null
  sunshineHours: number | null
  panels: RoofPanel[]
}

export type SystemSize = {
  panels: number
  kw: number
  productionKwh: number
  offsetPct: number
  limitedByRoof: boolean
  method: 'roof' | 'usage'
}

function round(value: number, places = 0): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/** How many panels, and what they make in year one. Uses the roof when we have it. */
export function sizeSystem(annualKwh: number, pricing: PricingSettings, roof: RoofDesign | null, panelOverride?: number | null): SystemSize {
  const targetKwh = annualKwh * (pricing.targetOffsetPct / 100)
  if (roof && roof.panels.length > 0) {
    const scale = (pricing.panelWatts / (roof.googlePanelWatts || pricing.panelWatts)) * (1 - pricing.dcToAcLossPct / 100)
    const available = roof.panels.length
    let count = 0
    let production = 0
    if (panelOverride) {
      count = Math.min(panelOverride, available)
      production = roof.panels.slice(0, count).reduce((sum, panel) => sum + panel.dcKwh * scale, 0)
    } else {
      while (count < available && production < targetKwh) {
        production += roof.panels[count].dcKwh * scale
        count += 1
      }
    }
    const limited = !panelOverride && production < targetKwh * 0.98
    return {
      panels: count,
      kw: round((count * pricing.panelWatts) / 1000, 2),
      productionKwh: Math.round(production),
      offsetPct: Math.round((production / annualKwh) * 100),
      limitedByRoof: limited,
      method: 'roof',
    }
  }
  const panels = panelOverride || Math.max(4, Math.ceil(((targetKwh / pricing.productionKwhPerKw) * 1000) / pricing.panelWatts))
  const kw = (panels * pricing.panelWatts) / 1000
  const production = kw * pricing.productionKwhPerKw
  return {
    panels,
    kw: round(kw, 2),
    productionKwh: Math.round(production),
    offsetPct: Math.round((production / annualKwh) * 100),
    limitedByRoof: false,
    method: 'usage',
  }
}

export type ScheduleRow = {
  year: number
  productionKwh: number
  billWithout: number
  billWith: number
  planCost: number
  savings: number
  cumulative: number
}

export type SavingsResult = {
  ready: boolean
  missing: string[]
  billNowMonthly: number
  billWithSolarMonthly: number
  planMonthly: number
  savingsMonthly: number
  savingsYear1: number
  savingsTotal: number
  costWithoutTotal: number
  costWithTotal: number
  schedule: ScheduleRow[]
}

/**
 * Year by year, without solar: usage × utility rate.
 * With solar: what the home still buys (not below the minimum bill), minus
 * export credits, plus the plan (production × plan rate, plus any battery fee).
 * Texas has no state net metering, so exported power earns the export credit,
 * not the full rate.
 */
export function projectSavings(input: {
  annualKwh: number
  productionKwh: number
  utilityRateCents: number
  pricing: PricingSettings
}): SavingsResult {
  const { pricing } = input
  const missing: string[] = []
  if (pricing.ppaRateCents == null) missing.push('plan rate')
  if (pricing.ppaEscalatorPct == null) missing.push('plan yearly increase')
  const rate = (pricing.ppaRateCents ?? 0) / 100
  const escalator = (pricing.ppaEscalatorPct ?? 0) / 100
  const selfUse = (pricing.includeBattery ? pricing.selfUsePctWithBattery : pricing.selfUsePctWithoutBattery) / 100
  const schedule: ScheduleRow[] = []
  let cumulative = 0
  let costWithout = 0
  let costWith = 0
  for (let year = 1; year <= pricing.termYears; year += 1) {
    const utilityCents = input.utilityRateCents * (1 + pricing.utilityEscalatorPct / 100) ** (year - 1)
    const exportCents = pricing.exportCreditCents * (1 + pricing.utilityEscalatorPct / 100) ** (year - 1)
    const production = input.productionKwh * (1 - pricing.degradationPct / 100) ** (year - 1)
    const usedAtHome = Math.min(production, input.annualKwh) * selfUse
    const exported = production - usedAtHome
    const billWithout = (input.annualKwh * utilityCents) / 100
    const minimum = pricing.minMonthlyBill * 12 * (1 + pricing.utilityEscalatorPct / 100) ** (year - 1)
    const billWith = Math.max(minimum, ((input.annualKwh - usedAtHome) * utilityCents) / 100 - (exported * exportCents) / 100)
    const planCost = production * rate * (1 + escalator) ** (year - 1) + (pricing.includeBattery ? pricing.batteryMonthlyAdder * 12 : 0)
    const savings = billWithout - billWith - planCost
    cumulative += savings
    costWithout += billWithout
    costWith += billWith + planCost
    schedule.push({
      year,
      productionKwh: Math.round(production),
      billWithout: round(billWithout, 2),
      billWith: round(billWith, 2),
      planCost: round(planCost, 2),
      savings: round(savings, 2),
      cumulative: round(cumulative, 2),
    })
  }
  const first = schedule[0]
  return {
    ready: missing.length === 0,
    missing,
    billNowMonthly: round(first.billWithout / 12, 2),
    billWithSolarMonthly: round(first.billWith / 12, 2),
    planMonthly: round(first.planCost / 12, 2),
    savingsMonthly: round(first.savings / 12, 2),
    savingsYear1: round(first.savings, 2),
    savingsTotal: round(cumulative, 2),
    costWithoutTotal: round(costWithout, 2),
    costWithTotal: round(costWith, 2),
    schedule,
  }
}

/** What a proposal shows. Saved with it, so a sent proposal never changes. */
export type ProposalSnapshot = {
  version: 1
  inputsHash: string
  preparedAt: string
  customer: { name: string; firstName: string; address: string | null }
  advisor: { name: string; phone: string; email: string }
  plan: { name: string; rateCents: number; escalatorPct: number; termYears: number }
  usage: UsageEstimate
  utility: { rateCents: number; fromBill: boolean; escalatorPct: number; exportCreditCents: number }
  system: SystemSize & { panelWatts: number; battery: string | null }
  money: Omit<SavingsResult, 'ready' | 'missing' | 'schedule'>
  schedule: ScheduleRow[]
  roof: {
    status: 'ok' | 'none'
    center: { lat: number; lng: number } | null
    zoom: number | null
    panelWidthM: number | null
    panelHeightM: number | null
    panels: Array<{ lat: number; lng: number; orientation: 'LANDSCAPE' | 'PORTRAIT'; azimuth: number }>
    imageryDate: string | null
  }
  preliminary: boolean
}

export function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] || 'there'
  return first.charAt(0).toUpperCase() + first.slice(1)
}

/** Small stable hash so an unchanged lead does not get a new draft. */
export function hashInputs(value: unknown): string {
  const textValue = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < textValue.length; index += 1) {
    hash ^= textValue.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Web Mercator pixel position inside a 640×640 static map centered on `center`. */
export function projectToImage(point: { lat: number; lng: number }, center: { lat: number; lng: number }, zoom: number): { x: number; y: number } {
  const world = (lat: number, lng: number) => {
    const scale = 256 * 2 ** zoom
    const sin = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999)
    return {
      x: scale * ((lng + 180) / 360),
      y: scale * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)),
    }
  }
  const p = world(point.lat, point.lng)
  const c = world(center.lat, center.lng)
  return { x: p.x - c.x + 320, y: p.y - c.y + 320 }
}

export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}
