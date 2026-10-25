import type { BillFields } from '../../shared/types';
import { supabase } from '../lib/supabase';
import {
  buildArchivePatch,
  buildCustomerUpdate,
  buildLeadActivity,
  buildLightBillFile,
  buildManualCustomerInsert,
  buildRestorePatch,
  explainLeadWriteError,
  type LeadActor,
  type LeadDraft,
} from './leadRecord';

export type LeadWriteResult = { ok: true; warning?: string } | { ok: false; error: string };

const BILL_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

function client() {
  if (!supabase) return null;
  return supabase;
}

async function writeActivity(row: Record<string, unknown>): Promise<void> {
  const db = client();
  if (!db) return;
  await db.from('powergenie_activity').insert(row);
}

async function attachBill(customerId: string, actor: LeadActor, file: File, now: Date): Promise<string | null> {
  const db = client();
  if (!db) return 'The hub is not connected.';
  const mimeType = BILL_TYPES.has(file.type) ? file.type : mimeFromName(file.name);
  if (!mimeType) return 'Upload a JPEG, PNG, WEBP, or PDF.';
  const built = buildLightBillFile({
    customerId,
    actor,
    fileName: file.name,
    mimeType,
    sizeBytes: file.size,
    now,
  });
  if ('error' in built) return built.error;
  const uploaded = await db.storage.from('powergenie').upload(built.path, file, {
    contentType: mimeType,
    upsert: false,
  });
  if (uploaded.error) return explainLeadWriteError(uploaded.error);
  const inserted = await db.from('powergenie_files').insert(built.row).select('id').maybeSingle();
  if (inserted.error || !inserted.data) {
    return inserted.error ? explainLeadWriteError(inserted.error) : 'The bill file did not attach.';
  }
  return null;
}

function mimeFromName(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return null;
}

export async function createManualLead(draft: LeadDraft, actor: LeadActor, file: File | null, now = new Date()): Promise<LeadWriteResult> {
  const db = client();
  if (!db) return { ok: false, error: 'The hub is not connected.' };
  let row: Record<string, unknown>;
  try {
    row = buildManualCustomerInsert(draft, actor, now);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Check the form and try again.' };
  }
  const inserted = await db.from('powergenie_customers').insert(row).select('id').maybeSingle();
  if (inserted.error || !inserted.data) {
    return { ok: false, error: inserted.error ? explainLeadWriteError(inserted.error) : 'The lead was not saved.' };
  }
  const id = String(inserted.data.id);
  let warning: string | undefined;
  if (file) {
    const billError = await attachBill(id, actor, file, now);
    if (billError) warning = `Lead saved, but the bill did not attach. ${billError}`;
  }
  await writeActivity(buildLeadActivity({
    customerId: id,
    actor,
    type: 'hub_lead_added',
    message: file && !warning ? 'Lead added from the Referral Hub. Bill attached.' : 'Lead added from the Referral Hub.',
    now,
  }));
  return warning ? { ok: true, warning } : { ok: true };
}

export async function updateManualLead(leadId: string, draft: LeadDraft, actor: LeadActor, file: File | null, now = new Date()): Promise<LeadWriteResult> {
  const db = client();
  if (!db) return { ok: false, error: 'The hub is not connected.' };
  let patch: Record<string, unknown>;
  try {
    patch = buildCustomerUpdate(draft, now);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Check the form and try again.' };
  }
  const updated = await db.from('powergenie_customers').update(patch).eq('id', leadId).select('id').maybeSingle();
  if (updated.error || !updated.data) {
    return { ok: false, error: updated.error ? explainLeadWriteError(updated.error) : 'That lead is not editable.' };
  }
  let warning: string | undefined;
  if (file) {
    const billError = await attachBill(leadId, actor, file, now);
    if (billError) warning = `Lead updated, but the new bill did not attach. ${billError}`;
  }
  await writeActivity(buildLeadActivity({
    customerId: leadId,
    actor,
    type: 'hub_lead_updated',
    message: 'Lead updated from the Referral Hub.',
    now,
  }));
  return warning ? { ok: true, warning } : { ok: true };
}

export async function archiveCustomerLead(leadId: string, actor: LeadActor, now = new Date()): Promise<LeadWriteResult> {
  const db = client();
  if (!db) return { ok: false, error: 'The hub is not connected.' };
  const updated = await db.from('powergenie_customers').update(buildArchivePatch(actor, now)).eq('id', leadId).select('id').maybeSingle();
  if (updated.error || !updated.data) {
    return { ok: false, error: updated.error ? explainLeadWriteError(updated.error) : 'That lead could not be archived.' };
  }
  await writeActivity(buildLeadActivity({
    customerId: leadId,
    actor,
    type: 'hub_lead_archived',
    message: 'Lead archived from the Referral Hub. The row and bill file were kept.',
    now,
  }));
  return { ok: true };
}

export async function restoreCustomerLead(leadId: string, actor: LeadActor, now = new Date()): Promise<LeadWriteResult> {
  const db = client();
  if (!db) return { ok: false, error: 'The hub is not connected.' };
  const updated = await db.from('powergenie_customers').update(buildRestorePatch(now)).eq('id', leadId).select('id').maybeSingle();
  if (updated.error || !updated.data) {
    return { ok: false, error: updated.error ? explainLeadWriteError(updated.error) : 'That lead could not be restored.' };
  }
  await writeActivity(buildLeadActivity({
    customerId: leadId,
    actor,
    type: 'hub_lead_restored',
    message: 'Lead restored to the active Referral Hub list.',
    now,
  }));
  return { ok: true };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
}

/** Reads a bill with the same extractor the website assistant uses. The person can correct the fields. */
export async function readLeadBill(file: File): Promise<{ fields: BillFields; warning: string | null } | { error: string }> {
  const db = client();
  if (!db) return { error: 'The hub is not connected.' };
  const mimeType = BILL_TYPES.has(file.type) ? file.type : mimeFromName(file.name);
  if (!mimeType) return { error: 'Upload a JPEG, PNG, WEBP, or PDF to read the bill.' };
  if (file.size > 10 * 1024 * 1024) return { error: 'That file is over 10 MB. You can still type the numbers.' };
  const { data: sessionData } = await db.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { error: 'Sign in again to read the bill. You can still type the numbers.' };
  let dataBase64 = '';
  try {
    dataBase64 = await fileToBase64(file);
  } catch {
    return { error: 'Could not read that file. You can still type the numbers.' };
  }
  const response = await fetch('/api/assistant?route=hub-bill', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ fileName: file.name, mimeType, dataBase64 }),
  });
  const payload = await response.json().catch(() => null) as { fields?: BillFields; warning?: string | null; error?: string } | null;
  if (!response.ok || !payload?.fields) {
    return { error: payload?.error || 'Could not read that bill. You can still type the numbers.' };
  }
  return { fields: payload.fields, warning: payload.warning ?? null };
}
