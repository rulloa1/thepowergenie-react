/**
 * Sequence Cron — runs every 15 minutes to send pending sequence messages.
 *
 * Deploy: supabase functions deploy sequence-cron
 * Schedule: Add pg_cron job or use Supabase Dashboard → Edge Functions → Schedule
 *
 * curl -X POST https://<project>.supabase.co/functions/v1/sequence-cron \
 *   -H "Authorization: Bearer <service_role_key>"
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { env, serviceKey, json, unauthorized } from '../_shared/http.ts';
import {
  type Lead,
  type Sequence,
  type SequenceTemplate,
  renderTemplate,
  isQuietHours,
} from '../_shared/sequence.ts';

const SITE_URL = 'https://thepowergenie.theroyeffect.com';
const BATCH_SIZE = 20; // Process up to 20 sequences per run

Deno.serve(async (req: Request) => {
  // Only allow POST with service role key
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const key = serviceKey();
  const cronSecret = Deno.env.get('CRON_SECRET')?.trim();
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  // Allow: service role key, CRON_SECRET, or internal pg_cron (no auth, checks x-forwarded-for)
  const isServiceRole = key && token === key;
  const isCronSecret = cronSecret && token === cronSecret;
  const isInternal = !authHeader && req.headers.get('x-forwarded-for')?.includes('127.0.0.1');

  if (!isServiceRole && !isCronSecret && !isInternal) {
    return unauthorized();
  }

  const url = env('SUPABASE_URL');
  if (!url || !key) {
    return json({ error: 'Not configured' }, 500);
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date().toISOString();

  // Fetch sequences due for sending
  const { data: sequences, error: seqError } = await admin
    .from('hub_sequences')
    .select('id, lead_id, current_step, unsubscribe_token')
    .eq('status', 'active')
    .lte('next_send_at', now)
    .limit(BATCH_SIZE);

  if (seqError) {
    console.error('sequence_cron_fetch_failed', seqError);
    return json({ error: 'Failed to fetch sequences' }, 500);
  }

  if (!sequences || sequences.length === 0) {
    return json({ processed: 0, message: 'No sequences due' });
  }

  const results: Array<{ id: string; status: string }> = [];

  for (const seq of sequences) {
    try {
      const result = await processSequence(admin, seq as Sequence);
      results.push({ id: seq.id, status: result });
    } catch (error) {
      console.error('sequence_process_failed', seq.id, error);
      results.push({ id: seq.id, status: 'error' });
    }
  }

  return json({ processed: results.length, results });
});

async function processSequence(
  admin: ReturnType<typeof createClient>,
  seq: Pick<Sequence, 'id' | 'lead_id' | 'current_step' | 'unsubscribe_token'>
): Promise<string> {
  // Get template for current step
  const { data: template } = await admin
    .from('hub_sequence_templates')
    .select('*')
    .eq('step', seq.current_step)
    .eq('is_active', true)
    .maybeSingle();

  if (!template) {
    // No more templates — mark complete
    await admin
      .from('hub_sequences')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        next_send_at: null,
      })
      .eq('id', seq.id);
    return 'completed';
  }

  // Get lead data
  const { data: lead } = await admin
    .from('powergenie_customers')
    .select('id, customer_name, email, phone, service_address, kwh_this_period, current_charges')
    .eq('id', seq.lead_id)
    .maybeSingle();

  if (!lead) {
    await admin
      .from('hub_sequences')
      .update({ status: 'paused', next_send_at: null })
      .eq('id', seq.id);
    return 'lead_not_found';
  }

  const unsubscribeUrl = `${SITE_URL}/unsubscribe/${seq.unsubscribe_token}`;
  const typedTemplate = template as SequenceTemplate;
  const typedLead = lead as Lead;

  // Send messages
  let emailSent = false;
  let smsSent = false;

  if (typedTemplate.channel === 'email' || typedTemplate.channel === 'both') {
    if (typedLead.email && typedTemplate.email_subject && typedTemplate.email_body) {
      emailSent = await sendEmail(
        typedLead.email,
        renderTemplate(typedTemplate.email_subject, typedLead, unsubscribeUrl),
        renderTemplate(typedTemplate.email_body, typedLead, unsubscribeUrl)
      );
    }
  }

  if (typedTemplate.channel === 'sms' || typedTemplate.channel === 'both') {
    if (typedLead.phone && typedTemplate.sms_body && !isQuietHours()) {
      smsSent = await sendSms(
        typedLead.phone,
        renderTemplate(typedTemplate.sms_body, typedLead, unsubscribeUrl)
      );
    }
  }

  // Log messages
  if (emailSent) {
    await admin.from('hub_sequence_messages').insert({
      sequence_id: seq.id,
      step: seq.current_step,
      channel: 'email',
      subject: typedTemplate.email_subject?.slice(0, 200),
      body_preview: typedTemplate.email_body?.slice(0, 200),
    });
  }
  if (smsSent) {
    await admin.from('hub_sequence_messages').insert({
      sequence_id: seq.id,
      step: seq.current_step,
      channel: 'sms',
      body_preview: typedTemplate.sms_body?.slice(0, 200),
    });
  }

  // Advance to next step
  const { data: nextTemplate } = await admin
    .from('hub_sequence_templates')
    .select('step, delay_hours')
    .eq('step', seq.current_step + 1)
    .eq('is_active', true)
    .maybeSingle();

  if (nextTemplate) {
    const nextSendAt = new Date(
      Date.now() + (nextTemplate as SequenceTemplate).delay_hours * 60 * 60 * 1000
    );
    await admin
      .from('hub_sequences')
      .update({
        current_step: seq.current_step + 1,
        next_send_at: nextSendAt.toISOString(),
      })
      .eq('id', seq.id);
    return 'advanced';
  } else {
    await admin
      .from('hub_sequences')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        next_send_at: null,
      })
      .eq('id', seq.id);
    return 'completed';
  }
}

async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY')?.trim();
  const from = Deno.env.get('NOTIFY_FROM')?.trim();
  if (!key || !from) return false;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, text: body }),
    });
    if (!res.ok) console.error('sequence_email_failed', res.status);
    return res.ok;
  } catch (error) {
    console.error('sequence_email_error', error);
    return false;
  }
}

async function sendSms(to: string, body: string): Promise<boolean> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  const from = Deno.env.get('TWILIO_FROM')?.trim();
  if (!sid || !token || !from) return false;

  const cleanTo = to.startsWith('+') ? to : `+1${to.replace(/\D/g, '')}`;
  const auth = btoa(`${sid}:${token}`);

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${auth}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: cleanTo, From: from, Body: body }).toString(),
      }
    );
    if (!res.ok) console.error('sequence_sms_failed', res.status);
    return res.ok;
  } catch (error) {
    console.error('sequence_sms_error', error);
    return false;
  }
}
