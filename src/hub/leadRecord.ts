import type { BillFields, UsageMonth } from '../../shared/types';
import { centralDateKey } from './time';

/** Stored stage values allowed by powergenie_customers.stage. */
export const LEAD_STAGES = [
  ['bill_received', 'Bill received'],
  ['savings_calc', 'Savings estimate'],
  ['panel_design', 'Panel design'],
  ['proposal_ready', 'Proposal ready'],
  ['presented', 'Presented'],
  ['signed', 'Signed'],
  ['site_survey', 'Site survey'],
  ['permits', 'Permits'],
  ['installed', 'Installed'],
  ['lost', 'Lost'],
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number][0];

const STAGE_LABELS = new Map<string, string>(LEAD_STAGES);

export function stageLabel(stage: string | null | undefined): string {
  if (!stage) return '—';
  return STAGE_LABELS.get(stage) || stage;
}

export function isLeadStage(value: string): value is LeadStage {
  return STAGE_LABELS.has(value);
}

/** created_by for a lead typed into the Referral Hub. Website rows stay null. */
export function manualCreatedBy(userId: string): string {
  return `manual:${userId}`;
}

export function isManualCreatedBy(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('manual:');
}

export type LeadDraft = {
  name: string;
  phone: string;
  email: string;
  address: string;
  utility: string;
  accountNumber: string;
  esiid: string;
  meterNumber: string;
  tdu: string;
  repPuctCertificate: string;
  kwh: string;
  days: string;
  kwhSameMonthLastYear: string;
  avgMonthlyKwh: string;
  totalDue: string;
  currentCharges: string;
  pastDue: string;
  billDate: string;
  ratePlan: string;
  stage: string;
  notes: string;
  usageHistory: UsageMonth[] | null;
};

export type LeadSnapshot = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  utility: string | null;
  accountNumber: string | null;
  esiid: string | null;
  meterNumber: string | null;
  tdu: string | null;
  repPuctCertificate: string | null;
  kwh: number | null;
  days: number | null;
  kwhSameMonthLastYear: number | null;
  avgMonthlyKwh: number | null;
  totalDue: number | null;
  currentCharges: number | null;
  pastDue: number | null;
  billDate: string | null;
  ratePlan: string | null;
  stage: string | null;
  notes: string | null;
  usageHistory: UsageMonth[] | null;
};

export type LeadActor = {
  id: string;
  fullName: string | null;
  email: string;
};

const BILL_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export function emptyDraft(): LeadDraft {
  return {
    name: '',
    phone: '',
    email: '',
    address: '',
    utility: '',
    accountNumber: '',
    esiid: '',
    meterNumber: '',
    tdu: '',
    repPuctCertificate: '',
    kwh: '',
    days: '',
    kwhSameMonthLastYear: '',
    avgMonthlyKwh: '',
    totalDue: '',
    currentCharges: '',
    pastDue: '',
    billDate: '',
    ratePlan: '',
    stage: 'bill_received',
    notes: '',
    usageHistory: null,
  };
}

function fieldText(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value);
}

export function draftFromLead(lead: LeadSnapshot): LeadDraft {
  return {
    name: lead.name === 'Unnamed lead' ? '' : lead.name,
    phone: fieldText(lead.phone),
    email: fieldText(lead.email),
    address: fieldText(lead.address),
    utility: lead.utility && lead.utility !== 'Not provided' ? lead.utility : '',
    accountNumber: fieldText(lead.accountNumber),
    esiid: fieldText(lead.esiid),
    meterNumber: fieldText(lead.meterNumber),
    tdu: fieldText(lead.tdu),
    repPuctCertificate: fieldText(lead.repPuctCertificate),
    kwh: fieldText(lead.kwh),
    days: fieldText(lead.days),
    kwhSameMonthLastYear: fieldText(lead.kwhSameMonthLastYear),
    avgMonthlyKwh: fieldText(lead.avgMonthlyKwh),
    totalDue: fieldText(lead.totalDue),
    currentCharges: fieldText(lead.currentCharges),
    pastDue: fieldText(lead.pastDue),
    billDate: fieldText(lead.billDate),
    ratePlan: fieldText(lead.ratePlan),
    stage: lead.stage && isLeadStage(lead.stage) ? lead.stage : 'bill_received',
    notes: fieldText(lead.notes),
    usageHistory: lead.usageHistory,
  };
}

function fillText(current: string, next: string | null): string {
  if (current.trim()) return current;
  return next?.trim() || current;
}

/** Fills blank fields from a bill read. Values the person already typed stay. */
export function applyBillToDraft(draft: LeadDraft, bill: BillFields): LeadDraft {
  return {
    ...draft,
    name: fillText(draft.name, bill.customerName),
    address: fillText(draft.address, bill.serviceAddress),
    utility: fillText(draft.utility, bill.utility),
    accountNumber: fillText(draft.accountNumber, bill.accountNumber),
    esiid: fillText(draft.esiid, bill.esiid),
    meterNumber: fillText(draft.meterNumber, bill.meterNumber),
    tdu: fillText(draft.tdu, bill.tdu),
    repPuctCertificate: fillText(draft.repPuctCertificate, bill.repPuctCertificate),
    kwh: fillText(draft.kwh, bill.kwhThisPeriod == null ? null : String(bill.kwhThisPeriod)),
    days: fillText(draft.days, bill.days == null ? null : String(bill.days)),
    kwhSameMonthLastYear: fillText(
      draft.kwhSameMonthLastYear,
      bill.kwhSameMonthLastYear == null ? null : String(bill.kwhSameMonthLastYear),
    ),
    avgMonthlyKwh: fillText(draft.avgMonthlyKwh, bill.avgMonthlyKwh == null ? null : String(bill.avgMonthlyKwh)),
    totalDue: fillText(draft.totalDue, bill.totalDue == null ? null : String(bill.totalDue)),
    currentCharges: fillText(draft.currentCharges, bill.currentCharges == null ? null : String(bill.currentCharges)),
    pastDue: fillText(draft.pastDue, bill.pastDue == null ? null : String(bill.pastDue)),
    billDate: fillText(draft.billDate, bill.billDate),
    ratePlan: fillText(draft.ratePlan, bill.ratePlan),
    usageHistory: draft.usageHistory?.length ? draft.usageHistory : bill.usageHistory,
  };
}

function clip(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function emptyToNull(value: string): string | null {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed || null;
}

function notesOrNull(value: string): string | null {
  const trimmed = value.replace(/\r\n/g, '\n').trim();
  return trimmed || null;
}

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

type ParsedNumber = { ok: true; value: number | null } | { ok: false; error: string };

function optionalNumber(raw: string, label: string, min: number, max: number, decimals: number): ParsedNumber {
  const trimmed = raw.replace(/[$,\s]/g, '').trim();
  if (!trimmed) return { ok: true, value: null };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return { ok: false, error: `${label} needs to be a number from ${min} to ${max.toLocaleString('en-US')}.` };
  }
  const factor = 10 ** decimals;
  return { ok: true, value: Math.round(parsed * factor) / factor };
}

export function validateDraft(draft: LeadDraft): string | null {
  const name = clip(draft.name, 160);
  if (name.length < 2) return 'Enter the customer name.';
  const address = clip(draft.address, 400);
  if (address.length < 1) return 'Enter the service address.';
  const phone = clip(draft.phone, 40);
  if (phone) {
    const count = digits(phone).length;
    if (count < 10 || count > 15) return 'Enter a phone number with 10 to 15 digits, or leave it blank.';
  }
  const email = clip(draft.email, 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter an email address, or leave it blank.';
  const esiid = digits(draft.esiid);
  if (draft.esiid.trim() && (esiid.length < 17 || esiid.length > 22)) {
    return 'ESI ID needs to be 17 to 22 digits, or left blank.';
  }
  if (clip(draft.meterNumber, 80).length > 40) return 'Meter number needs to be 40 characters or fewer.';
  if (clip(draft.accountNumber, 80).replace(/\s+/g, '').length > 40) return 'Account number needs to be 40 characters or fewer.';
  if (clip(draft.utility, 120).length > 80) return 'Utility name needs to be 80 characters or fewer.';
  if (clip(draft.tdu, 120).length > 80) return 'TDU needs to be 80 characters or fewer.';
  const certificate = digits(draft.repPuctCertificate);
  if (draft.repPuctCertificate.trim() && (certificate.length < 4 || certificate.length > 12)) {
    return 'PUCT certificate needs to be 4 to 12 digits, or left blank.';
  }
  if (!isLeadStage(draft.stage)) return 'Pick a stage from the list.';
  if (draft.notes.trim().length > 20000) return 'Notes are too long.';
  const numbers: Array<[string, string, number, number, number]> = [
    [draft.kwh, 'kWh this period', 0, 100000, 1],
    [draft.days, 'Days in the period', 1, 400, 0],
    [draft.kwhSameMonthLastYear, 'kWh last year', 0, 100000, 1],
    [draft.avgMonthlyKwh, 'Average monthly kWh', 0, 100000, 1],
    [draft.totalDue, 'Bill amount', -100000, 1000000, 2],
    [draft.currentCharges, 'Current charges', -100000, 1000000, 2],
    [draft.pastDue, 'Past due', -100000, 1000000, 2],
  ];
  for (const [raw, label, min, max, decimals] of numbers) {
    const parsed = optionalNumber(raw, label, min, max, decimals);
    if (!parsed.ok) return parsed.error;
  }
  if (draft.usageHistory && draft.usageHistory.length > 36) return 'Usage history can include at most 36 months.';
  return null;
}

function mustNumber(raw: string, label: string, min: number, max: number, decimals: number): number | null {
  const parsed = optionalNumber(raw, label, min, max, decimals);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

export type CustomerWrite = Record<string, unknown>;

function sharedBillColumns(draft: LeadDraft, nowIso: string): CustomerWrite {
  const kwh = mustNumber(draft.kwh, 'kWh this period', 0, 100000, 1);
  const daysRaw = mustNumber(draft.days, 'Days in the period', 1, 400, 0);
  const days = daysRaw == null ? null : Math.round(daysRaw);
  const current = mustNumber(draft.currentCharges, 'Current charges', -100000, 1000000, 2);
  const avgDay = kwh != null && days != null && days > 0 ? Math.round((kwh / days) * 10) / 10 : null;
  const cents = kwh != null && kwh > 0 && current != null && current > 0
    ? Math.round((current / kwh) * 100 * 1000) / 1000
    : null;
  const certificate = digits(draft.repPuctCertificate);
  return {
    customer_name: clip(draft.name, 160),
    phone: emptyToNull(clip(draft.phone, 40)),
    email: emptyToNull(clip(draft.email, 254).toLowerCase()),
    service_address: clip(draft.address, 400),
    utility: clip(draft.utility, 80) || 'Not provided',
    account_number: emptyToNull(clip(draft.accountNumber, 80).replace(/\s+/g, '')),
    bill_date: emptyToNull(clip(draft.billDate, 40)),
    rate_plan: emptyToNull(clip(draft.ratePlan, 40)),
    kwh_this_period: kwh,
    days: days != null && days > 0 ? days : null,
    avg_kwh_per_day: avgDay,
    kwh_same_month_last_year: mustNumber(draft.kwhSameMonthLastYear, 'kWh last year', 0, 100000, 1),
    current_charges: current,
    total_due: mustNumber(draft.totalDue, 'Bill amount', -100000, 1000000, 2),
    past_due: mustNumber(draft.pastDue, 'Past due', -100000, 1000000, 2),
    est_cents_per_kwh: cents,
    esiid: draft.esiid.trim() ? digits(draft.esiid) : null,
    meter_number: emptyToNull(clip(draft.meterNumber, 40)),
    tdu: emptyToNull(clip(draft.tdu, 80)),
    rep_puct_certificate: certificate ? certificate : null,
    avg_monthly_kwh: mustNumber(draft.avgMonthlyKwh, 'Average monthly kWh', 0, 100000, 1),
    usage_history: draft.usageHistory?.length ? draft.usageHistory : null,
    notes: notesOrNull(draft.notes),
    stage: draft.stage,
    updated_at: nowIso,
  };
}

/**
 * Row inserted for a lead typed into the hub. Text timestamps, stage
 * bill_received unless the form picked another, created_by marks it manual.
 * appointment_date is omitted so this row does not block a booking slot.
 */
export function buildManualCustomerInsert(draft: LeadDraft, actor: LeadActor, now: Date, id?: string): CustomerWrite {
  const error = validateDraft(draft);
  if (error) throw new Error(error);
  const nowIso = now.toISOString();
  const loggedOn = centralDateKey(now);
  return {
    id: id || crypto.randomUUID(),
    created_at: nowIso,
    logged_on: loggedOn,
    created_by: manualCreatedBy(actor.id),
    ...sharedBillColumns(draft, nowIso),
    date_sent_to_horace: loggedOn,
  };
}

/** Fields a hub member is allowed to change. Identity and appointment stay put. */
export function buildCustomerUpdate(draft: LeadDraft, now: Date): CustomerWrite {
  const error = validateDraft(draft);
  if (error) throw new Error(error);
  return sharedBillColumns(draft, now.toISOString());
}

export function buildArchivePatch(actor: LeadActor, now: Date): CustomerWrite {
  const nowIso = now.toISOString();
  return {
    archived_at: nowIso,
    archived_by: actor.id,
    updated_at: nowIso,
  };
}

export function buildRestorePatch(now: Date): CustomerWrite {
  const nowIso = now.toISOString();
  return {
    archived_at: null,
    archived_by: null,
    updated_at: nowIso,
  };
}

export function safeBillFileName(fileName: string, mimeType: string): string {
  const base = (fileName.split(/[/\\]/).pop() || 'light-bill').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const trimmed = base.slice(0, 60);
  if (trimmed.includes('.')) return trimmed;
  const extension = BILL_MIME[mimeType] || 'pdf';
  return `${trimmed || 'light-bill'}.${extension}`;
}

export function lightBillObjectPath(customerId: string, fileName: string, mimeType: string, fileId: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(customerId)) return null;
  const safeId = fileId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  const safeName = safeBillFileName(fileName, mimeType);
  if (!safeId || !/^[A-Za-z0-9._-]{1,80}$/.test(safeName)) return null;
  const path = `customers/${customerId}/light_bill/${safeId}-${safeName}`;
  if (!/^customers\/[A-Za-z0-9_-]{1,80}\/light_bill\/[A-Za-z0-9._-]{1,160}$/.test(path)) return null;
  return path;
}

export function buildLightBillFile(input: {
  customerId: string;
  actor: LeadActor;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  now: Date;
  fileId?: string;
}): { row: CustomerWrite; path: string } | { error: string } {
  if (!BILL_MIME[input.mimeType]) return { error: 'Upload a JPEG, PNG, WEBP, or PDF.' };
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) return { error: 'That file is empty.' };
  if (input.sizeBytes > 10 * 1024 * 1024) return { error: 'That file is over 10 MB. Try a photo or a smaller PDF.' };
  const fileId = input.fileId || crypto.randomUUID();
  const path = lightBillObjectPath(input.customerId, input.fileName, input.mimeType, fileId);
  if (!path) return { error: 'That file name cannot be saved. Rename it and try again.' };
  return {
    path,
    row: {
      id: fileId,
      customer_id: input.customerId,
      uploaded_by: input.actor.id,
      uploader_name: input.actor.fullName || input.actor.email,
      category: 'light_bill',
      file_name: safeBillFileName(input.fileName, input.mimeType),
      mime_type: input.mimeType,
      size_bytes: Math.round(input.sizeBytes),
      storage_path: path,
      created_at: input.now.toISOString(),
    },
  };
}

export function buildLeadActivity(input: {
  customerId: string;
  actor: LeadActor;
  type: 'hub_lead_added' | 'hub_lead_updated' | 'hub_lead_archived' | 'hub_lead_restored';
  message: string;
  now: Date;
  id?: string;
}): CustomerWrite {
  return {
    id: input.id || crypto.randomUUID(),
    customer_id: input.customerId,
    actor_id: input.actor.id,
    actor_name: (input.actor.fullName || input.actor.email).slice(0, 120),
    type: input.type,
    message: input.message.slice(0, 1000),
    created_at: input.now.toISOString(),
  };
}

export function isMissingArchiveColumn(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === '42703' && /archived_(at|by)/i.test(error.message || '')) return true;
  return /archived_(at|by)/i.test(error.message || '') && /does not exist|schema cache/i.test(error.message || '');
}

export function explainLeadWriteError(error: { code?: string | null; message?: string | null }): string {
  const message = error.message || '';
  const code = error.code || '';
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    return 'That change was rejected. Sign in as a hub member, and apply the latest database migration.';
  }
  if (/esiid/i.test(message)) return 'ESI ID needs to be 17 to 22 digits, or left blank.';
  if (/phone/i.test(message)) return 'Phone needs to be 40 characters or fewer.';
  if (/email/i.test(message)) return 'Email needs to be 254 characters or fewer.';
  if (/stage/i.test(message)) return 'Pick a stage from the list.';
  if (/usage_history/i.test(message)) return 'Usage history from the bill could not be saved.';
  if (/archived/i.test(message)) return 'Archiving needs the latest database migration.';
  return "Couldn't save that lead. Apply the latest database migration, then try again.";
}
