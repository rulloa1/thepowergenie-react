import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_PRICING,
  billHintFromNotes,
  effectivePricing,
  estimateAnnualUsage,
  normalizeOverrides,
  normalizePricing,
  projectSavings,
  projectToImage,
  sizeSystem,
  utilityRate,
  type ProposalSnapshot,
  type RoofDesign,
} from '../shared/workflow'
import { followupsForStage, tasksForStage } from '../server/workflow/plan'
import { renderProposalHtml } from '../server/workflow/proposalHtml'
import { nextTextWindow, smsConsent } from '../server/workflow/engine'

const pricing = normalizePricing({ ppaRateCents: 13, ppaEscalatorPct: 2.9 })

const blankUsage = {
  kwhThisPeriod: null,
  days: null,
  avgMonthlyKwh: null,
  usageHistory: null,
  totalDue: null,
  currentCharges: null,
  notes: null,
}

test('reads a bill range the customer gave on a quote form', () => {
  assert.deepEqual(billHintFromNotes('Project: New solar\nElectricity Bill: $300-$400\nRoof: shingles'), { low: 300, high: 400 })
  assert.deepEqual(billHintFromNotes('Electric bill: $250/month'), { low: 250, high: 250 })
  assert.equal(billHintFromNotes('Roof shade: none'), null)
  assert.equal(billHintFromNotes(null), null)
})

test('usage comes from the most trustworthy source available', () => {
  const months = Array.from({ length: 12 }, (_, index) => ({ month: `2026-${String(index + 1).padStart(2, '0')}`, kwh: 1000 }))
  const history = estimateAnnualUsage({ ...blankUsage, usageHistory: months, kwhThisPeriod: 3000 }, 15)
  assert.equal(history?.source, 'bill_history')
  assert.equal(history?.annualKwh, 12000)
  assert.equal(history?.confident, true)

  const meter = estimateAnnualUsage({
    ...blankUsage,
    usageHistory: months,
    smartMeterMonthly: months.map(point => ({ periodStart: `${point.month}-01`, kwh: 1500 })),
  }, 15)
  assert.equal(meter?.source, 'smart_meter')
  assert.equal(meter?.annualKwh, 18000)

  const range = estimateAnnualUsage({ ...blankUsage, notes: 'Electricity Bill: $300-$400' }, 15)
  assert.equal(range?.source, 'bill_range')
  assert.equal(range?.annualKwh, 28000)
  assert.equal(range?.confident, false)

  const override = estimateAnnualUsage({ ...blankUsage, notes: 'Electricity Bill: $300-$400' }, 15, 20000)
  assert.equal(override?.source, 'override')
  assert.equal(estimateAnnualUsage(blankUsage, 15), null)
})

test('uses the bill rate only when it looks like a real rate', () => {
  assert.deepEqual(utilityRate(1000, 150, 15), { cents: 15, fromBill: true })
  assert.deepEqual(utilityRate(1000, 900, 15), { cents: 15, fromBill: false })
  assert.deepEqual(utilityRate(null, 150, 14), { cents: 14, fromBill: false })
})

test('settings out of range fall back to the defaults', () => {
  const settings = normalizePricing({ ppaRateCents: 500, panelWatts: '410', utilityEscalatorPct: -2, includeBattery: false })
  assert.equal(settings.ppaRateCents, null)
  assert.equal(settings.panelWatts, 410)
  assert.equal(settings.utilityEscalatorPct, DEFAULT_PRICING.utilityEscalatorPct)
  assert.equal(settings.includeBattery, false)
  assert.deepEqual(normalizeOverrides({ ppaRateCents: '12.5', panelCount: 3, includeBattery: false }), { ppaRateCents: 12.5, includeBattery: false })
  assert.equal(effectivePricing(settings, { ppaRateCents: 11 }).ppaRateCents, 11)
})

test('sizes from usage when there is no roof data', () => {
  const size = sizeSystem(13000, pricing, null)
  assert.equal(size.method, 'usage')
  assert.equal(size.panels, 25)
  assert.equal(size.kw, 10)
  assert.ok(size.offsetPct >= 100)
})

test('sizes on the roof and says when the roof is the limit', () => {
  const roof: RoofDesign = {
    center: { lat: 30.07, lng: -95.46 },
    zoom: 20,
    formattedAddress: null,
    panelWidthM: 1.045,
    panelHeightM: 1.879,
    googlePanelWatts: 400,
    maxPanels: 10,
    imageryDate: '2025-03',
    imageryQuality: 'HIGH',
    roofAreaM2: 200,
    sunshineHours: 1700,
    panels: Array.from({ length: 10 }, (_, index) => ({ lat: 30.07, lng: -95.46 + index * 0.00001, orientation: 'LANDSCAPE' as const, azimuth: 180, dcKwh: 600 })),
  }
  const small = sizeSystem(3000, pricing, roof)
  assert.equal(small.method, 'roof')
  assert.equal(small.panels, 6)
  assert.equal(small.limitedByRoof, false)
  const big = sizeSystem(20000, pricing, roof)
  assert.equal(big.panels, 10)
  assert.equal(big.limitedByRoof, true)
  assert.equal(sizeSystem(20000, pricing, roof, 4).panels, 4)
})

test('savings add up and wait for a plan rate', () => {
  const result = projectSavings({ annualKwh: 12000, productionKwh: 12000, utilityRateCents: 15, pricing })
  assert.equal(result.ready, true)
  assert.equal(result.schedule.length, 25)
  const first = result.schedule[0]
  assert.ok(Math.abs(first.savings - (first.billWithout - first.billWith - first.planCost)) < 0.02)
  assert.equal(result.billNowMonthly, 150)
  assert.ok(result.schedule[24].billWithout > first.billWithout)
  const waiting = projectSavings({ annualKwh: 12000, productionKwh: 12000, utilityRateCents: 15, pricing: DEFAULT_PRICING })
  assert.equal(waiting.ready, false)
  assert.deepEqual(waiting.missing, ['plan rate', 'plan yearly increase'])
})

test('the map center lands in the middle of the picture', () => {
  const point = projectToImage({ lat: 30, lng: -95 }, { lat: 30, lng: -95 }, 20)
  assert.deepEqual({ x: Math.round(point.x), y: Math.round(point.y) }, { x: 320, y: 320 })
  const east = projectToImage({ lat: 30, lng: -94.9999 }, { lat: 30, lng: -95 }, 20)
  assert.ok(east.x > 320)
})

test('texts only go to leads who agreed to them, and only in the daytime', () => {
  assert.equal(smsConsent({ phone: '+17135550100', notes: 'TCPA consent: yes' }), true)
  assert.equal(smsConsent({ phone: '+17135550100', notes: 'Quote request form' }), false)
  const ctx = { firstName: 'Pat', advisorName: 'Horace Lawrence', advisorPhone: '510-241-7007', origin: 'https://example.test', proposalUrl: null, unsubscribeUrl: 'https://example.test/u' }
  assert.equal(followupsForStage('bill_received', ctx, false).some(plan => plan.channel === 'sms'), false)
  assert.equal(followupsForStage('bill_received', ctx, true).some(plan => plan.channel === 'sms'), true)
  for (const plan of followupsForStage('bill_received', ctx, false)) assert.match(plan.body, /Stop these emails/)
  // 03:00 Central is 08:00 UTC in the summer; the next window opens at 9 AM Central.
  const night = nextTextWindow(new Date('2026-07-01T08:00:00Z'))
  assert.ok(night && night.getTime() > Date.parse('2026-07-01T08:00:00Z'))
  assert.equal(nextTextWindow(new Date('2026-07-01T17:00:00Z')), null)
})

test('each stage gives the team its next task', () => {
  assert.equal(tasksForStage('bill_received', { firstName: 'Pat' }, false)[0]?.kind, 'get_bill')
  assert.equal(tasksForStage('bill_received', { firstName: 'Pat' }, true).length, 0)
  assert.equal(tasksForStage('signed', { firstName: 'Pat' }, true)[0]?.advancesTo, 'site_survey')
})

test('the proposal page escapes customer text and has no scripts', () => {
  const savings = projectSavings({ annualKwh: 12000, productionKwh: 12000, utilityRateCents: 15, pricing })
  const snapshot: ProposalSnapshot = {
    version: 1,
    inputsHash: 'x',
    preparedAt: '2026-10-26T12:00:00.000Z',
    customer: { name: 'Pat <img src=x onerror=alert(1)>', firstName: 'Pat', address: '1 Main St' },
    advisor: { name: 'Horace Lawrence', phone: '510-241-7007', email: 'h@example.test' },
    plan: { name: 'Sunrun monthly plan', rateCents: 13, escalatorPct: 2.9, termYears: 25 },
    usage: { annualKwh: 12000, source: 'bill_history', label: 'Usage history on the bill', confident: true },
    utility: { rateCents: 15, fromBill: true, escalatorPct: 3, exportCreditCents: 8 },
    system: { panels: 2, kw: 0.8, productionKwh: 12000, offsetPct: 100, limitedByRoof: false, method: 'roof', panelWatts: 400, battery: 'Tesla Powerwall 3' },
    money: { ...savings },
    schedule: savings.schedule,
    roof: {
      status: 'ok',
      center: { lat: 30, lng: -95 },
      zoom: 20,
      panelWidthM: 1,
      panelHeightM: 1.8,
      panels: [{ lat: 30, lng: -95, orientation: 'PORTRAIT', azimuth: 180 }, { lat: 30, lng: -94.99999, orientation: 'LANDSCAPE', azimuth: 90 }],
      imageryDate: '2025-03',
    },
    preliminary: false,
  }
  const page = renderProposalHtml(snapshot, { mode: 'customer', imageUrl: '/roof.png', interestedAction: '/proposal/abc/interested', interestedAt: null })
  assert.equal(/<script/i.test(page), false)
  assert.equal(page.includes('<img src=x'), false)
  assert.match(page, /&lt;img src=x/)
  assert.equal((page.match(/<rect /g) || []).length, 2)
  assert.match(page, /I'm interested\. Have Horace call me/)
  const preview = renderProposalHtml(snapshot, { mode: 'preview', imageUrl: null, interestedAction: null, interestedAt: null })
  assert.match(preview, /Draft preview/)
  assert.equal(/Have Horace call me/.test(preview), false)
})
