/**
 * Sequence management routes for the dashboard.
 * Handles start, pause, resume, status, and unsubscribe.
 */

import { HttpError, isRecord, json, readWebJson } from './http.js';
import { requireHubMember } from './hub-member.js';
import { supabaseFetch } from './supabase.js';

const SITE_URL = process.env.SITE_URL || 'https://thepowergenie.theroyeffect.com';

/** Get sequence status for a lead. */
export async function handleSequenceStatus(request: Request): Promise<Response> {
  await requireHubMember(request);

  const url = new URL(request.url);
  const leadId = url.searchParams.get('leadId');
  if (!leadId || !/^[a-f0-9-]{36}$/i.test(leadId)) {
    throw new HttpError(400, 'Invalid lead ID.');
  }

  const response = await supabaseFetch(
    `/rest/v1/hub_sequences?lead_id=eq.${leadId}&select=id,status,current_step,next_send_at,created_at,started_at,completed_at,unsubscribed_at`
  );

  if (!response.ok) {
    throw new HttpError(502, 'Could not fetch sequence status.');
  }

  const rows = (await response.json()) as Array<Record<string, unknown>>;
  const sequence = rows[0] || null;

  return json({ sequence });
}

/** Start a sequence for a lead manually. */
export async function handleSequenceStart(request: Request): Promise<Response> {
  await requireHubMember(request);

  const body = await readWebJson(request, 1000);
  if (!isRecord(body) || typeof body.leadId !== 'string') {
    throw new HttpError(400, 'Invalid request.');
  }

  const leadId = body.leadId;
  if (!/^[a-f0-9-]{36}$/i.test(leadId)) {
    throw new HttpError(400, 'Invalid lead ID.');
  }

  // Check if sequence exists
  const checkRes = await supabaseFetch(
    `/rest/v1/hub_sequences?lead_id=eq.${leadId}&select=id,status`
  );
  const existing = ((await checkRes.json()) as Array<{ id: string; status: string }>)[0];

  if (existing?.status === 'active') {
    return json({ ok: false, reason: 'already_active' });
  }
  if (existing?.status === 'unsubscribed') {
    return json({ ok: false, reason: 'unsubscribed' });
  }

  // Get first template delay
  const templateRes = await supabaseFetch(
    `/rest/v1/hub_sequence_templates?step=eq.0&is_active=eq.true&select=delay_hours`
  );
  const templates = (await templateRes.json()) as Array<{ delay_hours: number }>;
  const delayHours = templates[0]?.delay_hours ?? 1;

  const nextSendAt = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  if (existing) {
    // Update existing
    await supabaseFetch(`/rest/v1/hub_sequences?id=eq.${existing.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'active',
        current_step: 0,
        next_send_at: nextSendAt,
        started_at: now,
      }),
    });
  } else {
    // Insert new
    await supabaseFetch('/rest/v1/hub_sequences', {
      method: 'POST',
      headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({
        lead_id: leadId,
        status: 'active',
        current_step: 0,
        next_send_at: nextSendAt,
        started_at: now,
      }),
    });
  }

  return json({ ok: true });
}

/** Pause an active sequence. */
export async function handleSequencePause(request: Request): Promise<Response> {
  await requireHubMember(request);

  const body = await readWebJson(request, 1000);
  if (!isRecord(body) || typeof body.leadId !== 'string') {
    throw new HttpError(400, 'Invalid request.');
  }

  const leadId = body.leadId;
  if (!/^[a-f0-9-]{36}$/i.test(leadId)) {
    throw new HttpError(400, 'Invalid lead ID.');
  }

  const response = await supabaseFetch(
    `/rest/v1/hub_sequences?lead_id=eq.${leadId}&status=eq.active`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'paused', next_send_at: null }),
    }
  );

  return json({ ok: response.ok });
}

/** Resume a paused sequence. */
export async function handleSequenceResume(request: Request): Promise<Response> {
  await requireHubMember(request);

  const body = await readWebJson(request, 1000);
  if (!isRecord(body) || typeof body.leadId !== 'string') {
    throw new HttpError(400, 'Invalid request.');
  }

  const leadId = body.leadId;
  if (!/^[a-f0-9-]{36}$/i.test(leadId)) {
    throw new HttpError(400, 'Invalid lead ID.');
  }

  // Get current step
  const checkRes = await supabaseFetch(
    `/rest/v1/hub_sequences?lead_id=eq.${leadId}&status=eq.paused&select=id,current_step`
  );
  const seq = ((await checkRes.json()) as Array<{ id: string; current_step: number }>)[0];

  if (!seq) {
    return json({ ok: false, reason: 'not_paused' });
  }

  // Resume in 1 hour
  const nextSendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await supabaseFetch(`/rest/v1/hub_sequences?id=eq.${seq.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'active', next_send_at: nextSendAt }),
  });

  return json({ ok: true });
}

/** Public unsubscribe endpoint — no auth required. */
export async function handleUnsubscribe(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token || !/^[a-f0-9-]{36}$/i.test(token)) {
    throw new HttpError(400, 'Invalid unsubscribe link.');
  }

  if (request.method === 'GET') {
    // Return simple HTML page
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe - Power Genie</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 400px; margin: 60px auto; padding: 20px; text-align: center; }
    h1 { color: #1A1A2E; }
    button { background: #FF6B00; color: white; border: none; padding: 14px 28px; font-size: 16px; border-radius: 8px; cursor: pointer; }
    button:hover { background: #E55A00; }
    .done { color: #4CAF50; }
  </style>
</head>
<body>
  <h1>Unsubscribe</h1>
  <p>Click below to stop receiving follow-up messages from Power Genie.</p>
  <form method="POST">
    <button type="submit">Unsubscribe</button>
  </form>
</body>
</html>`;
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  // POST — process unsubscribe
  const response = await supabaseFetch(
    `/rest/v1/hub_sequences?unsubscribe_token=eq.${token}&status=in.(active,paused,pending)`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'unsubscribed',
        unsubscribed_at: new Date().toISOString(),
        next_send_at: null,
      }),
    }
  );

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribed - Power Genie</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 400px; margin: 60px auto; padding: 20px; text-align: center; }
    h1 { color: #4CAF50; }
  </style>
</head>
<body>
  <h1>✓ Unsubscribed</h1>
  <p>You've been removed from our follow-up sequence. You won't receive any more automated messages.</p>
  <p>Questions? Contact Horace at <a href="tel:+15102417007">510-241-7007</a>.</p>
</body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

/** Auto-pause sequence when a new booking is made. */
export async function pauseSequenceOnBooking(leadId: string): Promise<void> {
  try {
    await supabaseFetch(
      `/rest/v1/hub_sequences?lead_id=eq.${leadId}&status=eq.active`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'paused', next_send_at: null }),
      }
    );
  } catch (error) {
    console.error('pause_sequence_on_booking_failed', error);
  }
}
