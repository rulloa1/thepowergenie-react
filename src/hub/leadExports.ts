import type { Lead } from './useLeadFeed';

function escapeCsv(val: unknown): string {
  if (val == null) return '""';
  const str = String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

export function leadsToCsvString(leads: Lead[]): string {
  const headers = [
    'ID',
    'Name',
    'Phone',
    'Email',
    'Address',
    'Source',
    'Created At',
    'Appointment',
    'Utility / TDU',
    'Account Number',
    'Meter Number',
    'ESI ID',
    'Bill kWh',
    'Bill Amount',
    'Avg Monthly kWh',
    'Workflow Option',
    'Notes',
  ];

  const rows = leads.map((l) => [
    escapeCsv(l.id),
    escapeCsv(l.name),
    escapeCsv(l.phone || ''),
    escapeCsv(l.email || ''),
    escapeCsv(l.address || ''),
    escapeCsv(l.sourceLabel || l.source),
    escapeCsv(l.createdAt),
    escapeCsv(l.appointment || ''),
    escapeCsv(l.tdu || ''),
    escapeCsv(l.accountNumber || ''),
    escapeCsv(l.meterNumber || ''),
    escapeCsv(l.esiid || ''),
    escapeCsv(l.kwh ?? ''),
    escapeCsv(l.amount != null ? l.amount.toFixed(2) : ''),
    escapeCsv(l.avgMonthlyKwh ?? ''),
    escapeCsv(l.workflowOption || ''),
    escapeCsv(l.notes || ''),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}

export function leadsToJsonString(leads: Lead[]): string {
  return JSON.stringify(leads, null, 2);
}

export function downloadFile(filename: string, content: string, mimeType: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateTwoStepReviewSmsText(name: string): string {
  const displayName = name?.trim() || 'there';
  return `Hey ${displayName}, it's Rory with The Power Genie by Sunrun. You're almost done with your solar savings review. There are just 2 quick steps left: 1) send me a photo or PDF of a recent electric bill, and 2) approve the Smart Meter Texas request. It's an email from Smart Meter Texas asking you to allow access to your usage data, so just click accept. After that, Horace can build your exact numbers. Any questions? Just reply here. Reply STOP to opt out.`;
}

export function generateTwoStepReviewEmail(name: string): { subject: string; body: string } {
  const displayName = name?.trim() || 'there';
  const subject = '2 quick steps to finish your solar savings review';
  const body =
    `Hi ${displayName}, you're almost there! To finish your custom savings estimate, we just need two things:\n\n` +
    `1. **Your electric bill:** reply to this email with a photo or PDF of a recent bill showing all pages.\n` +
    `2. **Smart Meter Texas approval:** check your inbox (and spam folder) for an email from Smart Meter Texas asking you to approve access to your electricity usage. Click accept. It's read-only, and it lets us base your estimate on your real usage instead of a guess.\n\n` +
    `That takes about 5 minutes, and then Horace Lawrence from Sunrun and I can walk you through your numbers with no pressure. Questions? Call or text me at 281-323-0450.\n\n` +
    `Thanks,\n` +
    `Rory Ulloa, The Power Genie by Sunrun`;

  return { subject, body };
}

export function generateTwoStepReviewSmsUrl(lead: Lead): string {
  const cleanPhone = (lead.phone || '').replace(/[^\d+]/g, '');
  const text = generateTwoStepReviewSmsText(lead.name);
  return `sms:${cleanPhone}?body=${encodeURIComponent(text)}`;
}

export function generateTwoStepReviewEmailUrl(lead: Lead): string {
  const { subject, body } = generateTwoStepReviewEmail(lead.name);
  return `mailto:${lead.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

