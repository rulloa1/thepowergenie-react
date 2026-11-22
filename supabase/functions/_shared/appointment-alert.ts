import type { Admin } from './db.ts';
import { env } from './http.ts';
import { sendLeadAlert, type LeadAlert } from './notify.ts';

/** The owner address comes from the hub, never from public booking input. */
export async function notifyAppointment(admin: Admin, alert: LeadAlert, includeTeam = true) {
  const { data: owners } = await admin.from('hub_profiles').select('email').eq('role', 'owner');
  const recipients = (owners ?? []).map(owner => String(owner.email || '').trim().toLowerCase()).filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  const settings = { resendApiKey: env('RESEND_API_KEY'), notifyFrom: env('NOTIFY_FROM') };
  const status = await sendLeadAlert(alert, { ...settings, notifyEmailTo: recipients.join(',') });
  const { error } = await admin.from('hub_appointments').update({ owner_email_status: status }).eq('id', alert.id);
  if (error) console.error('appointment_email_status_write_failed', error.code);
  if (includeTeam) {
    const others = (env('NOTIFY_EMAIL_TO') || '').split(',').filter(email => !recipients.includes(email.trim().toLowerCase()));
    await sendLeadAlert({ ...alert, id: alert.id + '-team' }, { ...settings, notifyEmailTo: others.join(','),
      twilioAccountSid: env('TWILIO_ACCOUNT_SID'), twilioAuthToken: env('TWILIO_AUTH_TOKEN'),
      twilioFrom: env('TWILIO_FROM'), notifySmsTo: env('NOTIFY_SMS_TO') });
  }
  return status;
}
