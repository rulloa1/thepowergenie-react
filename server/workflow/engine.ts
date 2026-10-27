import { randomUUID } from 'node:crypto'
import {
  STAGE_ORDER,
  effectivePricing,
  estimateAnnualUsage,
  firstName,
  hashInputs,
  normalizeOverrides,
  normalizePricing,
  projectSavings,
  sizeSystem,
  stageIndex,
  utilityRate,
  type LeadOverrides,
  type PricingSettings,
  type ProposalSnapshot,
  type RoofDesign,
  type SavingsResult,
  type SystemSize,
  type UsageEstimate,
} from '../../shared/workflow.js'
import { siteOrigin } from '../../supabase/functions/_shared/notify.js'
import { HttpError } from '../http.js'
import { sendCustomEmail, sendCustomSms } from '../notify.js'
import { inList, insertReturning, patchRows, selectOne, selectRows, upsertRow } from './db.js'
import { googleKey, lookupRoof } from './google.js'
import { billRequestFollowups, billTask, followupsForStage, interestedMessages, perkFromNotes, proposalMessages, tasksForStage, type FollowupPlan, type MessageContext } from './plan.js'

export type LeadRow = {
  id: string
  created_at: string
  updated_at: string | null
  customer_name: string | null
  service_address: string | null
  phone: string | null
  email: string | null
  notes: string | null
  kwh_this_period: number | null
  days: number | null
  avg_monthly_kwh: number | null
  usage_history: Array<{ month: string; kwh: number }> | null
  total_due: number | null
  current_charges: number | null
  stage: string | null
  esiid: string | null
  archived_at: string | null
}

export type WorkflowRow = {
  lead_id: string
  last_stage: string | null
  overrides: LeadOverrides | null
  usage: UsageEstimate | null
  system: SystemSize | null
  savings: SavingsResult | null
  design: (RoofDesign & { address?: string }) | null
  design_status: 'pending' | 'ok' | 'no_key' | 'not_found' | 'no_address' | 'error'
  design_note: string | null
  design_fetched_at: string | null
  contact_token: string
  opted_out_at: string | null
  updated_at: string
}

export type ProposalRow = {
  id: string
  lead_id: string
  status: 'draft' | 'approved' | 'sent' | 'superseded'
  snapshot: ProposalSnapshot
  public_token: string
  created_at: string
  updated_at: string
  approved_at: string | null
  approved_by_name: string | null
  sent_at: string | null
  sent_channels: string[]
  viewed_at: string | null
  view_count: number
  interested_at: string | null
}

export type TaskRow = {
  id: string
  lead_id: string
  kind: string
  title: string
  detail: string | null
  due_at: string
  done_at: string | null
  done_by_name: string | null
  cancelled_at: string | null
  created_at: string
}

export type FollowupRow = {
  id: string
  lead_id: string
  key: string
  stage: string
  channel: 'email' | 'sms'
  send_at: string
  status: 'scheduled' | 'sent' | 'skipped' | 'failed' | 'cancelled'
  subject: string | null
  body: string
  sent_at: string | null
  note: string | null
}

export type Actor = { id: string | null; name: string }

const LEAD_COLUMNS =
  'id,created_at,updated_at,customer_name,service_address,phone,email,notes,kwh_this_period,days,avg_monthly_kwh,usage_history,total_due,current_charges,stage,esiid,archived_at'

const SYSTEM: Actor = { id: null, name: 'Automatic' }

/**
 * Which stage each automatic task belongs to. Others (like "interested" and the
 * launch-page perk tasks) stay open until someone finishes them.
 */
const TASK_STAGE: Record<string, string> = {
  approve_proposal: 'proposal_ready',
  call_after_proposal: 'presented',
  decide_quiet_lead: 'presented',
  schedule_survey: 'signed',
  submit_permits: 'site_survey',
  schedule_install: 'permits',
  confirm_install: 'permits',
  ask_review: 'installed',
}

const DESIGN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const BASELINE_AGE_MS = 2 * 60 * 60 * 1000

export function origin(): string {
  // Same origin the lead alerts use, so every link points at the live site.
  return siteOrigin(process.env.SITE_URL)
}

export function proposalUrl(token: string): string {
  return `${origin()}/proposal/${token}`
}

function unsubscribeUrl(token: string): string {
  return `${origin()}/api/assistant?route=workflow&action=unsubscribe&t=${token}`
}

function nowIso(): string {
  return new Date().toISOString()
}

function addHours(hours: number, from = new Date()): string {
  return new Date(from.getTime() + hours * 3_600_000).toISOString()
}

export function smsConsent(lead: Pick<LeadRow, 'notes' | 'phone'>): boolean {
  return Boolean(lead.phone) && /TCPA consent:\s*yes/i.test(lead.notes || '')
}

/** Texts go out 9 AM to 8 PM Central only. Returns the next allowed time, or null if now is fine. */
export function nextTextWindow(now = new Date()): Date | null {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(now))
  if (hour >= 9 && hour < 20) return null
  const hoursUntilNine = hour >= 20 ? 24 - hour + 9 : 9 - hour
  const next = new Date(now.getTime() + hoursUntilNine * 3_600_000)
  next.setUTCMinutes(10, 0, 0)
  return next
}

export async function loadSettings(): Promise<PricingSettings> {
  const row = await selectOne<{ pricing: unknown }>('hub_settings', { id: 'eq.1' }, 'pricing')
  return normalizePricing(row?.pricing)
}

export async function saveSettings(input: unknown, actor: Actor): Promise<PricingSettings> {
  const pricing = normalizePricing(input)
  await upsertRow('hub_settings', { id: 1, pricing, updated_at: nowIso(), updated_by: actor.id }, 'id')
  // Leads still before the proposal step get rebuilt on the next run.
  await patchRows(
    'hub_lead_workflow',
    { last_stage: `in.(${['bill_received', 'savings_calc', 'panel_design', 'proposal_ready'].join(',')})` },
    { updated_at: '2000-01-01T00:00:00.000Z' },
  ).catch(() => 0)
  return pricing
}

async function loadLead(leadId: string): Promise<LeadRow> {
  const lead = await selectOne<LeadRow>('powergenie_customers', { id: `eq.${leadId}` }, LEAD_COLUMNS)
  if (!lead) throw new HttpError(404, 'That lead was not found.')
  return lead
}

async function ensureWorkflow(leadId: string): Promise<{ row: WorkflowRow; created: boolean }> {
  const existing = await selectOne<WorkflowRow>('hub_lead_workflow', { lead_id: `eq.${leadId}` })
  if (existing) return { row: existing, created: false }
  const inserted = await insertReturning<WorkflowRow>('hub_lead_workflow', { lead_id: leadId }, true)
  const row = inserted || (await selectOne<WorkflowRow>('hub_lead_workflow', { lead_id: `eq.${leadId}` }))
  if (!row) throw new HttpError(502, 'The workflow could not start for this lead.')
  return { row, created: Boolean(inserted) }
}

async function smartMeterMonthly(esiid: string | null): Promise<Array<{ periodStart: string; kwh: number }>> {
  if (!esiid) return []
  try {
    const rows = await selectRows<{ period_start: string; kwh: number }>(
      'smt_usage_monthly',
      { esi_id: `eq.${esiid}` },
      { select: 'period_start,kwh', order: 'period_start.desc', limit: 24 },
    )
    return rows.map(row => ({ periodStart: row.period_start, kwh: Number(row.kwh) }))
  } catch {
    return []
  }
}

async function logActivity(leadId: string, actor: Actor, type: string, message: string): Promise<void> {
  await insertReturning('powergenie_activity', {
    id: randomUUID(),
    customer_id: leadId,
    actor_id: actor.id,
    actor_name: actor.name.slice(0, 120),
    type,
    message: message.slice(0, 1000),
    created_at: nowIso(),
  }).catch(() => null)
}

function needsDesign(wf: WorkflowRow, address: string | null): boolean {
  if (wf.design_status === 'pending' || wf.design_status === 'error') return true
  if (wf.design_status === 'no_key') return Boolean(googleKey())
  if (wf.design_status === 'no_address') return Boolean(address && address.trim().length >= 6)
  if ((wf.design?.address || null) !== (address || null)) return true
  if (wf.design_status === 'ok' && wf.design_fetched_at) {
    return Date.now() - Date.parse(wf.design_fetched_at) > DESIGN_MAX_AGE_MS
  }
  return false
}

function buildSnapshot(input: {
  lead: LeadRow
  pricing: PricingSettings
  usage: UsageEstimate
  utility: { cents: number; fromBill: boolean }
  system: SystemSize
  savings: SavingsResult
  roof: RoofDesign | null
}): ProposalSnapshot {
  const { lead, pricing, usage, utility, system, savings, roof } = input
  const name = (lead.customer_name || 'Homeowner').trim()
  const panels = roof && system.method === 'roof'
    ? roof.panels.slice(0, system.panels).map(panel => ({ lat: panel.lat, lng: panel.lng, orientation: panel.orientation, azimuth: panel.azimuth }))
    : []
  const core = {
    customer: { name, firstName: firstName(name), address: lead.service_address },
    advisor: { name: pricing.advisorName, phone: pricing.advisorPhone, email: pricing.advisorEmail },
    plan: { name: pricing.planName, rateCents: pricing.ppaRateCents ?? 0, escalatorPct: pricing.ppaEscalatorPct ?? 0, termYears: pricing.termYears },
    usage,
    utility: { rateCents: utility.cents, fromBill: utility.fromBill, escalatorPct: pricing.utilityEscalatorPct, exportCreditCents: pricing.exportCreditCents },
    system: { ...system, panelWatts: pricing.panelWatts, battery: pricing.includeBattery ? pricing.batteryName : null },
    money: {
      billNowMonthly: savings.billNowMonthly,
      billWithSolarMonthly: savings.billWithSolarMonthly,
      planMonthly: savings.planMonthly,
      savingsMonthly: savings.savingsMonthly,
      savingsYear1: savings.savingsYear1,
      savingsTotal: savings.savingsTotal,
      costWithoutTotal: savings.costWithoutTotal,
      costWithTotal: savings.costWithTotal,
    },
    schedule: savings.schedule,
    roof: {
      status: panels.length ? ('ok' as const) : ('none' as const),
      center: panels.length && roof ? roof.center : null,
      zoom: panels.length && roof ? roof.zoom : null,
      panelWidthM: panels.length && roof ? roof.panelWidthM : null,
      panelHeightM: panels.length && roof ? roof.panelHeightM : null,
      panels,
      imageryDate: panels.length && roof ? roof.imageryDate : null,
    },
    preliminary: !usage.confident,
  }
  return { version: 1, inputsHash: hashInputs(core), preparedAt: nowIso(), ...core }
}

function messageContext(lead: LeadRow, wf: WorkflowRow, pricing: PricingSettings, proposalToken: string | null): MessageContext {
  return {
    firstName: firstName(lead.customer_name || 'there'),
    advisorName: pricing.advisorName,
    advisorPhone: pricing.advisorPhone,
    origin: origin(),
    proposalUrl: proposalToken ? proposalUrl(proposalToken) : null,
    unsubscribeUrl: unsubscribeUrl(wf.contact_token),
    perk: perkFromNotes(lead.notes),
  }
}

async function scheduleFollowups(lead: LeadRow, stage: string, plans: FollowupPlan[]): Promise<number> {
  let count = 0
  for (const plan of plans) {
    if (plan.channel === 'email' && !lead.email) continue
    if (plan.channel === 'sms' && !lead.phone) continue
    const inserted = await insertReturning(
      'hub_followups',
      {
        lead_id: lead.id,
        key: plan.key,
        stage,
        channel: plan.channel,
        send_at: addHours(plan.delayHours),
        subject: plan.subject,
        body: plan.body,
        note: plan.onlyWithoutUsage ? 'only_without_usage' : null,
      },
      true,
    )
    if (inserted) count += 1
  }
  return count
}

/** Tasks and customer messages for the stage the lead just entered. */
async function enterStage(lead: LeadRow, wf: WorkflowRow, stage: string, pricing: PricingSettings, opts: { baseline: boolean; hasUsage: boolean; proposalToken: string | null }): Promise<void> {
  const open = await selectRows<TaskRow>('hub_tasks', { lead_id: `eq.${lead.id}`, done_at: 'is.null', cancelled_at: 'is.null' })
  for (const task of open) {
    const taskStage = TASK_STAGE[task.kind]
    if (!taskStage) continue
    if (stage === 'lost' || taskStage !== stage) {
      const finishedByProgress = stage !== 'lost' && stageIndex(stage) > stageIndex(taskStage)
      await patchRows('hub_tasks', { id: `eq.${task.id}` }, finishedByProgress
        ? { done_at: nowIso(), done_by_name: SYSTEM.name }
        : { cancelled_at: nowIso() })
    }
  }
  if (stage === 'lost') {
    await patchRows('hub_tasks', { lead_id: `eq.${lead.id}`, done_at: 'is.null', cancelled_at: 'is.null' }, { cancelled_at: nowIso() })
    await patchRows('hub_followups', { lead_id: `eq.${lead.id}`, status: 'eq.scheduled' }, { status: 'cancelled', note: 'Lead marked lost' })
    return
  }
  // Bill reminders (note only_without_usage) are not tied to a stage.
  await patchRows('hub_followups', { lead_id: `eq.${lead.id}`, status: 'eq.scheduled', stage: `neq.${stage}`, note: 'is.null' }, { status: 'cancelled', note: 'Lead moved to another stage' })
  const name = firstName(lead.customer_name || 'there')
  for (const task of tasksForStage(stage, { firstName: name, perk: perkFromNotes(lead.notes) })) {
    await insertReturning('hub_tasks', {
      lead_id: lead.id,
      kind: task.kind,
      title: task.title,
      detail: task.detail,
      due_at: addHours(task.dueHours),
    }, true)
  }
  if (opts.baseline || wf.opted_out_at || lead.archived_at) return
  const plans = followupsForStage(stage, messageContext(lead, wf, pricing, opts.proposalToken), smsConsent(lead))
  await scheduleFollowups(lead, stage, plans)
}

/**
 * Until a real bill or Smart Meter Texas usage is in (a bill range is only a
 * rough guess), keep a "get the bill" task open and send the bill reminders.
 * Leads that were already in the list before the workflow started get the
 * task but no emails; their reminder rows are saved as skipped, so they are
 * never sent later either.
 */
async function requestBillIfNeeded(lead: LeadRow, wf: WorkflowRow, stage: string, usage: UsageEstimate | null, pricing: PricingSettings, createdNow: boolean): Promise<void> {
  const needsBill = !usage || !usage.confident
  const open = stage !== 'lost' && !lead.archived_at && stageIndex(stage) >= 0 && stageIndex(stage) <= stageIndex('presented')
  if (!needsBill || !open) {
    await patchRows('hub_tasks', { lead_id: `eq.${lead.id}`, kind: 'eq.get_bill', done_at: 'is.null', cancelled_at: 'is.null' }, needsBill
      ? { cancelled_at: nowIso() }
      : { done_at: nowIso(), done_by_name: SYSTEM.name })
    return
  }
  const plan = billTask({ firstName: firstName(lead.customer_name || 'there') }, Boolean(usage))
  await insertReturning('hub_tasks', { lead_id: lead.id, kind: plan.kind, title: plan.title, detail: plan.detail, due_at: addHours(plan.dueHours) }, true)
  const age = Date.now() - Date.parse(lead.created_at)
  const existedBefore = createdNow && Number.isFinite(age) && age > BASELINE_AGE_MS
  const plans = billRequestFollowups(messageContext(lead, wf, pricing, null), smsConsent(lead))
  if (existedBefore) {
    for (const item of plans) {
      await insertReturning('hub_followups', {
        lead_id: lead.id,
        key: item.key,
        stage: 'bill_received',
        channel: item.channel,
        send_at: nowIso(),
        status: 'skipped',
        subject: item.subject,
        body: item.body,
        note: 'Lead was in the list before automatic messages started',
      }, true)
    }
    return
  }
  if (wf.opted_out_at) return
  await scheduleFollowups(lead, 'bill_received', plans)
}

async function setStage(leadId: string, stage: string): Promise<void> {
  await patchRows('powergenie_customers', { id: `eq.${leadId}` }, { stage, updated_at: nowIso() })
}

export type RunResult = {
  stage: string
  usage: UsageEstimate | null
  system: SystemSize | null
  savingsReady: boolean
  missing: string[]
  designStatus: WorkflowRow['design_status']
  draftId: string | null
}

/**
 * Brings one lead up to date: usage, roof design, savings, the draft
 * proposal, the stage, and the tasks and messages for that stage.
 * Safe to run any number of times.
 */
export async function runLead(leadId: string): Promise<RunResult> {
  const lead = await loadLead(leadId)
  const settings = await loadSettings()
  const ensured = await ensureWorkflow(leadId)
  let wf = ensured.row
  const overrides = normalizeOverrides(wf.overrides)
  const pricing = effectivePricing(settings, overrides)
  const utility = utilityRate(lead.kwh_this_period, lead.current_charges, pricing.utilityRateCents)
  const usage = estimateAnnualUsage({
    kwhThisPeriod: lead.kwh_this_period,
    days: lead.days,
    avgMonthlyKwh: lead.avg_monthly_kwh,
    usageHistory: lead.usage_history,
    totalDue: lead.total_due,
    currentCharges: lead.current_charges,
    notes: lead.notes,
    smartMeterMonthly: await smartMeterMonthly(lead.esiid),
  }, utility.cents, overrides.annualKwh)

  const patch: Record<string, unknown> = { usage, updated_at: nowIso() }
  if (usage && !lead.archived_at && needsDesign(wf, lead.service_address)) {
    const roof = await lookupRoof(lead.service_address)
    if (roof.status === 'ok') {
      Object.assign(patch, {
        design: { ...roof.design, address: lead.service_address },
        design_status: 'ok',
        design_note: null,
        design_fetched_at: nowIso(),
      })
    } else {
      Object.assign(patch, {
        design: roof.status === 'error' ? wf.design : { address: lead.service_address },
        design_status: roof.status,
        design_note: roof.note,
        design_fetched_at: nowIso(),
      })
    }
  }
  const design = ((patch.design as WorkflowRow['design']) ?? wf.design) || null
  const designStatus = ((patch.design_status as WorkflowRow['design_status']) ?? wf.design_status)
  const roof = designStatus === 'ok' && design?.panels?.length ? (design as RoofDesign) : null
  const system = usage ? sizeSystem(usage.annualKwh, pricing, roof, overrides.panelCount) : null
  const savings = usage && system ? projectSavings({ annualKwh: usage.annualKwh, productionKwh: system.productionKwh, utilityRateCents: utility.cents, pricing }) : null
  patch.system = system
  patch.savings = savings
  await patchRows('hub_lead_workflow', { lead_id: `eq.${leadId}` }, patch)
  wf = { ...wf, ...(patch as Partial<WorkflowRow>) }

  // Draft proposal: refresh the open draft, or start one when the numbers changed.
  const proposals = await selectRows<ProposalRow>('hub_proposals', { lead_id: `eq.${leadId}`, status: 'neq.superseded' }, { order: 'created_at.desc', limit: 5 })
  let draft = proposals.find(row => row.status === 'draft') || null
  let newDraft = false
  const live = proposals.find(row => row.status === 'approved' || row.status === 'sent') || null
  const designDone = designStatus !== 'pending'
  if (usage && system && savings?.ready && designDone && !lead.archived_at) {
    const snapshot = buildSnapshot({ lead, pricing, usage, utility, system, savings, roof })
    if (draft) {
      if (draft.snapshot?.inputsHash !== snapshot.inputsHash) {
        await patchRows('hub_proposals', { id: `eq.${draft.id}`, status: 'eq.draft' }, { snapshot, updated_at: nowIso() })
      }
    } else if (!live || live.snapshot?.inputsHash !== snapshot.inputsHash) {
      draft = await insertReturning<ProposalRow>('hub_proposals', { lead_id: leadId, status: 'draft', snapshot }, true)
      newDraft = Boolean(draft)
    }
  }

  // Move forward through the automatic stages. Never backwards, never out of "lost".
  const current = lead.stage || 'bill_received'
  let stage = current
  if (current !== 'lost' && !lead.archived_at) {
    let target = 'bill_received'
    if (usage) target = 'savings_calc'
    if (usage && system && designDone) target = 'panel_design'
    if (draft || live) target = 'proposal_ready'
    if (live?.status === 'sent') target = 'presented'
    if (stageIndex(target) > stageIndex(current)) {
      stage = target
      await setStage(leadId, stage)
    }
  }

  if (wf.last_stage !== stage) {
    const age = Date.now() - Date.parse(lead.created_at)
    const baseline = ensured.created && Number.isFinite(age) && age > BASELINE_AGE_MS
    const token = live?.public_token || null
    await enterStage(lead, wf, stage, pricing, { baseline, hasUsage: Boolean(usage), proposalToken: token })
    await patchRows('hub_lead_workflow', { lead_id: `eq.${leadId}` }, { last_stage: stage, updated_at: nowIso() })
  } else if (newDraft && stage !== 'lost') {
    // A new draft for a lead past the first proposal (a new bill, say) still needs Horace's review.
    await upsertRow('hub_tasks', {
      lead_id: leadId,
      kind: 'approve_proposal',
      title: `Review and approve ${firstName(lead.customer_name || 'there')}'s ${live ? 'updated ' : ''}proposal`,
      detail: live
        ? 'The numbers changed since the last proposal was sent. Review the new draft and approve it to send.'
        : 'Check the numbers and the roof layout, adjust if needed, then approve to send it.',
      due_at: addHours(24),
      done_at: null,
      done_by: null,
      done_by_name: null,
      cancelled_at: null,
    }, 'lead_id,kind')
  }

  await requestBillIfNeeded(lead, wf, stage, usage, pricing, ensured.created)

  return {
    stage,
    usage,
    system,
    savingsReady: Boolean(savings?.ready),
    missing: savings?.missing || (usage ? [] : ['usage']),
    designStatus,
    draftId: draft?.id || null,
  }
}

export async function saveOverrides(leadId: string, input: unknown, actor: Actor): Promise<RunResult> {
  await loadLead(leadId)
  await ensureWorkflow(leadId)
  const overrides = normalizeOverrides(input)
  await patchRows('hub_lead_workflow', { lead_id: `eq.${leadId}` }, { overrides, updated_at: nowIso() })
  await logActivity(leadId, actor, 'workflow_adjusted', 'Proposal numbers adjusted in the sales workflow.')
  return runLead(leadId)
}

export type ApproveResult = { status: 'sent' | 'approved'; channels: string[]; url: string; note: string | null }

export async function approveProposal(proposalId: string, actor: Actor, send: boolean): Promise<ApproveResult> {
  const proposal = await selectOne<ProposalRow>('hub_proposals', { id: `eq.${proposalId}` })
  if (!proposal) throw new HttpError(404, 'That proposal was not found.')
  if (proposal.status !== 'draft') throw new HttpError(409, 'This proposal was already approved. Refresh to see the latest.')
  const lead = await loadLead(proposal.lead_id)
  const { row: wf } = await ensureWorkflow(lead.id)
  const settings = await loadSettings()
  const pricing = effectivePricing(settings, normalizeOverrides(wf.overrides))
  await patchRows('hub_proposals', { lead_id: `eq.${lead.id}`, status: 'in.(approved,sent)' }, { status: 'superseded', updated_at: nowIso() })
  const changed = await patchRows('hub_proposals', { id: `eq.${proposalId}`, status: 'eq.draft' }, {
    status: 'approved',
    approved_at: nowIso(),
    approved_by: actor.id,
    approved_by_name: actor.name,
    updated_at: nowIso(),
  })
  if (!changed) throw new HttpError(409, 'This proposal was already approved. Refresh to see the latest.')
  await patchRows('hub_tasks', { lead_id: `eq.${lead.id}`, kind: 'eq.approve_proposal', done_at: 'is.null' }, { done_at: nowIso(), done_by: actor.id, done_by_name: actor.name })

  const url = proposalUrl(proposal.public_token)
  const channels: string[] = []
  let note: string | null = null
  if (send) {
    if (wf.opted_out_at) {
      note = 'The customer opted out of messages. Share the link yourself.'
    } else {
      const ctx = { ...messageContext(lead, wf, pricing, proposal.public_token), savingsMonthly: proposal.snapshot.money.savingsMonthly, systemKw: proposal.snapshot.system.kw }
      for (const plan of proposalMessages(ctx, smsConsent(lead))) {
        if (plan.channel === 'email' && lead.email) {
          if (await sendCustomEmail(lead.email, plan.subject || 'Your solar proposal', plan.body)) channels.push('email')
        }
        if (plan.channel === 'sms' && lead.phone) {
          const wait = nextTextWindow()
          if (wait) {
            await insertReturning('hub_followups', { lead_id: lead.id, key: plan.key, stage: 'presented', channel: 'sms', send_at: wait.toISOString(), body: plan.body }, true)
            channels.push('text (scheduled for 9 AM)')
          } else if (await sendCustomSms(lead.phone, plan.body)) {
            channels.push('text')
          }
        }
      }
      if (!channels.length) note = lead.email ? 'The email did not go out. Share the link yourself.' : 'This lead has no email. Share the link yourself.'
    }
  }
  if (channels.length) {
    await patchRows('hub_proposals', { id: `eq.${proposalId}` }, { status: 'sent', sent_at: nowIso(), sent_channels: channels, updated_at: nowIso() })
    if (stageIndex(lead.stage) < stageIndex('presented') && lead.stage !== 'lost') {
      await setStage(lead.id, 'presented')
      await enterStage({ ...lead, stage: 'presented' }, wf, 'presented', pricing, { baseline: false, hasUsage: true, proposalToken: proposal.public_token })
      await patchRows('hub_lead_workflow', { lead_id: `eq.${lead.id}` }, { last_stage: 'presented' })
    }
  }
  await logActivity(lead.id, actor, 'proposal_approved', channels.length
    ? `Proposal approved by ${actor.name} and sent by ${channels.join(' and ')}.`
    : `Proposal approved by ${actor.name}.`)
  return { status: channels.length ? 'sent' : 'approved', channels, url, note }
}

/** Marks a proposal sent after Horace shared the link himself. */
export async function markProposalShared(proposalId: string, actor: Actor): Promise<void> {
  const proposal = await selectOne<ProposalRow>('hub_proposals', { id: `eq.${proposalId}` })
  if (!proposal || proposal.status !== 'approved') throw new HttpError(409, 'Approve the proposal first.')
  const lead = await loadLead(proposal.lead_id)
  await patchRows('hub_proposals', { id: `eq.${proposalId}` }, { status: 'sent', sent_at: nowIso(), sent_channels: ['shared by hand'], updated_at: nowIso() })
  if (stageIndex(lead.stage) < stageIndex('presented') && lead.stage !== 'lost') await setStage(lead.id, 'presented')
  await logActivity(lead.id, actor, 'proposal_shared', `Proposal link shared by ${actor.name}.`)
  await runLead(lead.id)
}

export async function completeTask(taskId: string, actor: Actor): Promise<void> {
  const task = await selectOne<TaskRow>('hub_tasks', { id: `eq.${taskId}` })
  if (!task) throw new HttpError(404, 'That task was not found.')
  if (task.done_at || task.cancelled_at) return
  await patchRows('hub_tasks', { id: `eq.${taskId}` }, { done_at: nowIso(), done_by: actor.id, done_by_name: actor.name })
  const lead = await loadLead(task.lead_id)
  const plan = tasksForStage(TASK_STAGE[task.kind] || '', { firstName: firstName(lead.customer_name || 'there') }).find(item => item.kind === task.kind)
  if (plan?.advancesTo && stageIndex(plan.advancesTo) > stageIndex(lead.stage) && lead.stage !== 'lost') {
    await setStage(lead.id, plan.advancesTo)
    await logActivity(lead.id, actor, 'stage_advanced', `${task.title} done. Moved to the next stage.`)
  }
  await runLead(lead.id)
}

export async function reopenTask(taskId: string): Promise<void> {
  await patchRows('hub_tasks', { id: `eq.${taskId}` }, { done_at: null, done_by: null, done_by_name: null })
}

export async function cancelFollowup(followupId: string): Promise<void> {
  await patchRows('hub_followups', { id: `eq.${followupId}`, status: 'eq.scheduled' }, { status: 'cancelled', note: 'Cancelled in the dashboard' })
}

export async function recordInterest(token: string): Promise<ProposalRow | null> {
  const proposal = await selectOne<ProposalRow>('hub_proposals', { public_token: `eq.${token}` })
  if (!proposal || (proposal.status !== 'sent' && proposal.status !== 'approved')) return null
  if (proposal.interested_at) return proposal
  const at = nowIso()
  await patchRows('hub_proposals', { id: `eq.${proposal.id}` }, { interested_at: at })
  const lead = await loadLead(proposal.lead_id)
  const name = firstName(lead.customer_name || 'The customer')
  await upsertRow('hub_tasks', {
    lead_id: lead.id,
    kind: 'interested',
    title: `${name} wants to move forward. Call now`,
    detail: `${lead.customer_name || 'The customer'} tapped "I'm interested" on the proposal${lead.phone ? `. Phone: ${lead.phone}` : ''}.`,
    due_at: at,
    done_at: null,
    cancelled_at: null,
  }, 'lead_id,kind')
  await logActivity(lead.id, SYSTEM, 'proposal_interested', `${lead.customer_name || 'The customer'} tapped "I'm interested" on the proposal.`)
  // Tell the customer right away that a call is coming, with a link to book a time.
  try {
    const wf = (await ensureWorkflow(lead.id)).row
    if (!wf.opted_out_at && !lead.archived_at) {
      const pricing = await loadSettings()
      await scheduleFollowups(lead, 'presented', interestedMessages(messageContext(lead, wf, pricing, proposal.public_token), smsConsent(lead)))
    }
  } catch (error) {
    console.error('interested_reply_failed', error instanceof Error ? error.message : 'unknown')
  }
  const alertTo = (process.env.NOTIFY_EMAIL_TO || '').split(',').map(value => value.trim()).filter(Boolean)
  const text = `${lead.customer_name || 'A customer'} wants to move forward on their solar proposal. Call ${lead.phone || 'them'} now. ${origin()}/dashboard?tab=leads&id=${encodeURIComponent(lead.id)}`
  for (const to of alertTo) await sendCustomEmail(to, `${lead.customer_name || 'A customer'} is interested in their proposal`, text)
  for (const to of (process.env.NOTIFY_SMS_TO || '').split(',').map(value => value.trim()).filter(Boolean)) await sendCustomSms(to, `Power Genie: ${text}`)
  return { ...proposal, interested_at: at }
}

export async function recordView(proposal: ProposalRow): Promise<void> {
  await patchRows('hub_proposals', { id: `eq.${proposal.id}` }, {
    view_count: (proposal.view_count || 0) + 1,
    viewed_at: proposal.viewed_at || nowIso(),
  }).catch(() => 0)
}

export async function unsubscribe(token: string): Promise<boolean> {
  if (!/^[0-9a-f]{36}$/.test(token)) return false
  const changed = await patchRows('hub_lead_workflow', { contact_token: `eq.${token}`, opted_out_at: 'is.null' }, { opted_out_at: nowIso() })
  const row = await selectOne<{ lead_id: string }>('hub_lead_workflow', { contact_token: `eq.${token}` }, 'lead_id')
  if (!row) return false
  await patchRows('hub_followups', { lead_id: `eq.${row.lead_id}`, status: 'eq.scheduled' }, { status: 'cancelled', note: 'Customer unsubscribed' })
  if (changed) await logActivity(row.lead_id, SYSTEM, 'unsubscribed', 'The customer opted out of workflow emails and texts.')
  return true
}

async function sendFollowup(row: FollowupRow): Promise<'sent' | 'skipped' | 'failed' | 'later'> {
  const lead = await selectOne<LeadRow>('powergenie_customers', { id: `eq.${row.lead_id}` }, LEAD_COLUMNS)
  const wf = await selectOne<WorkflowRow>('hub_lead_workflow', { lead_id: `eq.${row.lead_id}` }, 'lead_id,last_stage,usage,opted_out_at')
  const skip = async (note: string) => {
    await patchRows('hub_followups', { id: `eq.${row.id}`, status: 'eq.scheduled' }, { status: 'skipped', note })
    return 'skipped' as const
  }
  if (!lead || lead.archived_at) return skip('Lead archived')
  if (wf?.opted_out_at) return skip('Customer opted out')
  if (row.note === 'only_without_usage') {
    if (wf?.usage?.confident) return skip('Bill or usage arrived')
    if (lead.stage === 'lost' || stageIndex(lead.stage) > stageIndex('presented')) return skip('Lead moved past the proposal')
  } else if (lead.stage !== row.stage && !(row.stage === 'presented' && row.key.startsWith('proposal:'))) {
    return skip('Lead moved to another stage')
  }
  if (row.channel === 'sms') {
    if (!smsConsent(lead)) return skip('No text consent on file')
    const wait = nextTextWindow()
    if (wait) {
      await patchRows('hub_followups', { id: `eq.${row.id}` }, { send_at: wait.toISOString() })
      return 'later'
    }
  }
  const ok = row.channel === 'email'
    ? Boolean(lead.email) && (await sendCustomEmail(lead.email!, row.subject || 'An update from The Power Genie', row.body))
    : Boolean(lead.phone) && (await sendCustomSms(lead.phone!, row.body))
  await patchRows('hub_followups', { id: `eq.${row.id}`, status: 'eq.scheduled' }, ok
    ? { status: 'sent', sent_at: nowIso() }
    : { status: 'failed', note: 'The email or text service did not accept it' })
  return ok ? 'sent' : 'failed'
}

/** Runs every 15 minutes: new or changed leads, then due customer messages. */
export async function tick(limits = { leads: 8, messages: 25 }): Promise<{ leads: number; messages: Record<string, number> }> {
  const leads = await selectRows<Pick<LeadRow, 'id' | 'created_at' | 'updated_at' | 'stage'>>(
    'powergenie_customers',
    { archived_at: 'is.null' },
    { select: 'id,created_at,updated_at,stage', order: 'created_at.desc', limit: 500 },
  )
  const ids = leads.map(lead => lead.id)
  const flows: Array<Pick<WorkflowRow, 'lead_id' | 'last_stage' | 'updated_at'>> = []
  // Keep each request URL short.
  for (let start = 0; start < ids.length; start += 80) {
    flows.push(...await selectRows<Pick<WorkflowRow, 'lead_id' | 'last_stage' | 'updated_at'>>(
      'hub_lead_workflow',
      { lead_id: inList(ids.slice(start, start + 80)) },
      { select: 'lead_id,last_stage,updated_at', limit: 1000 },
    ))
  }
  const byLead = new Map(flows.map(flow => [flow.lead_id, flow]))
  const due = leads.filter(lead => {
    const flow = byLead.get(lead.id)
    if (!flow) return true
    if ((lead.stage || 'bill_received') !== flow.last_stage) return true
    const changed = lead.updated_at || lead.created_at
    return Boolean(changed && Date.parse(changed) > Date.parse(flow.updated_at))
  })
  let ran = 0
  for (const lead of due.slice(0, limits.leads)) {
    try {
      await runLead(lead.id)
      ran += 1
    } catch (error) {
      console.error('workflow_tick_lead_failed', error instanceof Error ? error.message : 'unknown')
    }
  }
  const messages: Record<string, number> = { sent: 0, skipped: 0, failed: 0, later: 0 }
  const rows = await selectRows<FollowupRow>('hub_followups', { status: 'eq.scheduled', send_at: `lte.${nowIso()}` }, { order: 'send_at.asc', limit: limits.messages })
  for (const row of rows) {
    try {
      messages[await sendFollowup(row)] += 1
    } catch (error) {
      console.error('workflow_tick_message_failed', error instanceof Error ? error.message : 'unknown')
    }
  }
  return { leads: ran, messages }
}

export async function leadDetail(leadId: string) {
  const lead = await loadLead(leadId)
  const settings = await loadSettings()
  const wf = await selectOne<WorkflowRow>('hub_lead_workflow', { lead_id: `eq.${leadId}` })
  const proposals = await selectRows<ProposalRow>('hub_proposals', { lead_id: `eq.${leadId}` }, { order: 'created_at.desc', limit: 10 })
  const tasks = await selectRows<TaskRow>('hub_tasks', { lead_id: `eq.${leadId}` }, { order: 'due_at.asc', limit: 50 })
  const followups = await selectRows<FollowupRow>('hub_followups', { lead_id: `eq.${leadId}` }, { order: 'send_at.asc', limit: 50 })
  return {
    stage: lead.stage || 'bill_received',
    stages: [...STAGE_ORDER, 'lost'],
    rateReady: settings.ppaRateCents != null && settings.ppaEscalatorPct != null,
    googleReady: Boolean(googleKey()),
    smsConsent: smsConsent(lead),
    workflow: wf
      ? {
          overrides: normalizeOverrides(wf.overrides),
          usage: wf.usage,
          system: wf.system,
          savings: wf.savings ? { ...wf.savings, schedule: undefined } : null,
          designStatus: wf.design_status,
          designNote: wf.design_note,
          designPanels: wf.design?.panels?.length ?? 0,
          optedOut: Boolean(wf.opted_out_at),
          updatedAt: wf.updated_at,
        }
      : null,
    proposals: proposals.map(row => ({
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      approvedAt: row.approved_at,
      approvedBy: row.approved_by_name,
      sentAt: row.sent_at,
      sentChannels: row.sent_channels,
      viewedAt: row.viewed_at,
      viewCount: row.view_count,
      interestedAt: row.interested_at,
      url: row.status === 'approved' || row.status === 'sent' ? proposalUrl(row.public_token) : null,
      summary: {
        panels: row.snapshot.system.panels,
        kw: row.snapshot.system.kw,
        savingsMonthly: row.snapshot.money.savingsMonthly,
        savingsTotal: row.snapshot.money.savingsTotal,
        planMonthly: row.snapshot.money.planMonthly,
        billNowMonthly: row.snapshot.money.billNowMonthly,
        offsetPct: row.snapshot.system.offsetPct,
        preliminary: row.snapshot.preliminary,
        roof: row.snapshot.roof.status,
      },
    })),
    tasks,
    followups: followups.map(row => ({ ...row, body: row.body.slice(0, 400) })),
  }
}

export async function openTasks() {
  const tasks = await selectRows<TaskRow>('hub_tasks', { done_at: 'is.null', cancelled_at: 'is.null' }, { order: 'due_at.asc', limit: 60 })
  const ids = [...new Set(tasks.map(task => task.lead_id))]
  const leads = ids.length
    ? await selectRows<{ id: string; customer_name: string | null; archived_at: string | null }>('powergenie_customers', { id: inList(ids) }, { select: 'id,customer_name,archived_at' })
    : []
  const names = new Map(leads.map(lead => [lead.id, lead]))
  const settings = await loadSettings()
  return {
    rateReady: settings.ppaRateCents != null && settings.ppaEscalatorPct != null,
    googleReady: Boolean(googleKey()),
    tasks: tasks
      .filter(task => !names.get(task.lead_id)?.archived_at)
      .map(task => ({ ...task, leadName: names.get(task.lead_id)?.customer_name || 'Lead' })),
  }
}
