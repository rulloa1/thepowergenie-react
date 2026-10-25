/**
 * Automated Follow-Up Sequences — shared helpers for Edge Functions.
 * Sends personalized email + SMS after appointment completion.
 *
 * Note: All database queries use Supabase's parameterized query builder,
 * which is safe from SQL injection.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type SequenceStatus = 'pending' | 'active' | 'paused' | 'completed' | 'unsubscribed';

export interface Sequence {
  id: string;
  lead_id: string;
  status: SequenceStatus;
  current_step: number;
  next_send_at: string | null;
  proposal_path: string | null;
  unsubscribe_token: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface SequenceTemplate {
  id: string;
  step: number;
  delay_hours: number;
  channel: 'email' | 'sms' | 'both';
  email_subject: string | null;
  email_body: string | null;
  sms_body: string | null;
  is_active: boolean;
}

export interface Lead {
  id: string;
  customer_name: string;
  email: string | null;
  phone: string | null;
  service_address: string | null;
  kwh_this_period: number | null;
  current_charges: number | null;
}

/** Estimate monthly savings based on bill data. Simple heuristic for now. */
export function estimateMonthlySavings(lead: Lead): number {
  const currentCharges = lead.current_charges ?? 150;
  // Assume 30-40% savings with solar
  return Math.round(currentCharges * 0.35);
}

/** Render template placeholders with lead data. */
export function renderTemplate(
  template: string,
  lead: Lead,
  unsubscribeUrl: string
): string {
  const savings = estimateMonthlySavings(lead);
  return template
    .replace(/\{\{name\}\}/g, lead.customer_name || 'there')
    .replace(/\{\{savings\}\}/g, savings.toString())
    .replace(/\{\{address\}\}/g, lead.service_address || 'your home')
    .replace(/\{\{kwh\}\}/g, (lead.kwh_this_period ?? 0).toLocaleString('en-US'))
    .replace(/\{\{unsubscribe_url\}\}/g, unsubscribeUrl);
}

/** Check if current time is within quiet hours (no SMS). */
export function isQuietHours(timeZone = 'America/Chicago'): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  });
  const hour = parseInt(formatter.format(now), 10);
  // Quiet hours: 9 PM (21) to 9 AM (9)
  return hour >= 21 || hour < 9;
}

/** Start a sequence for a lead after their appointment completes. */
export async function startSequence(
  admin: SupabaseClient,
  leadId: string
): Promise<{ started: boolean; reason?: string }> {
  // Check if sequence already exists
  const { data: existing } = await admin
    .from('hub_sequences')
    .select('id, status')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (existing?.status === 'active') {
    return { started: false, reason: 'already_active' };
  }
  if (existing?.status === 'completed') {
    return { started: false, reason: 'already_completed' };
  }
  if (existing?.status === 'unsubscribed') {
    return { started: false, reason: 'unsubscribed' };
  }

  // Get first template
  const { data: template } = await admin
    .from('hub_sequence_templates')
    .select('delay_hours')
    .eq('step', 0)
    .eq('is_active', true)
    .maybeSingle();

  if (!template) {
    return { started: false, reason: 'no_template' };
  }

  const nextSendAt = new Date(Date.now() + template.delay_hours * 60 * 60 * 1000);

  if (existing) {
    // Resume existing sequence
    await admin
      .from('hub_sequences')
      .update({
        status: 'active',
        current_step: 0,
        next_send_at: nextSendAt.toISOString(),
        started_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    // Create new sequence
    await admin.from('hub_sequences').insert({
      lead_id: leadId,
      status: 'active',
      current_step: 0,
      next_send_at: nextSendAt.toISOString(),
      started_at: new Date().toISOString(),
    });
  }

  return { started: true };
}

/** Pause a sequence (e.g., when lead books a new appointment). */
export async function pauseSequence(
  admin: SupabaseClient,
  leadId: string
): Promise<boolean> {
  const { error } = await admin
    .from('hub_sequences')
    .update({ status: 'paused', next_send_at: null })
    .eq('lead_id', leadId)
    .eq('status', 'active');
  return !error;
}

/** Resume a paused sequence. */
export async function resumeSequence(
  admin: SupabaseClient,
  leadId: string
): Promise<boolean> {
  const { data: seq } = await admin
    .from('hub_sequences')
    .select('id, current_step')
    .eq('lead_id', leadId)
    .eq('status', 'paused')
    .maybeSingle();

  if (!seq) return false;

  const { data: template } = await admin
    .from('hub_sequence_templates')
    .select('delay_hours')
    .eq('step', seq.current_step)
    .eq('is_active', true)
    .maybeSingle();

  if (!template) return false;

  // Resume in 1 hour (don't use full delay since they paused mid-sequence)
  const nextSendAt = new Date(Date.now() + 60 * 60 * 1000);

  const { error } = await admin
    .from('hub_sequences')
    .update({ status: 'active', next_send_at: nextSendAt.toISOString() })
    .eq('id', seq.id);

  return !error;
}

/** Process unsubscribe by token. */
export async function unsubscribeByToken(
  admin: SupabaseClient,
  token: string,
  reason?: string
): Promise<boolean> {
  const { error } = await admin
    .from('hub_sequences')
    .update({
      status: 'unsubscribed',
      unsubscribed_at: new Date().toISOString(),
      unsubscribe_reason: reason || null,
      next_send_at: null,
    })
    .eq('unsubscribe_token', token)
    .in('status', ['active', 'paused', 'pending']);

  return !error;
}
