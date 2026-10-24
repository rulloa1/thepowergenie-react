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

export interface YearScheduleRow {
  year: number;
  solarPayment: number;
  utilityWithoutSolar: number;
  utilityWithSolar: number;
  totalWithSolar: number;
  annualSavings: number;
  cumulativeSavings: number;
  solarGenerationKwh: number;
}

export function generate25YearSolarSchedule(lead: Lead): YearScheduleRow[] {
  // Baseline calculations
  const baselineMonthlyBill = lead.amount || 401.18;
  const initialAnnualUtilityCost = baselineMonthlyBill * 12;
  const monthlySolarPayment = 198.0;
  const annualSolarPayment = monthlySolarPayment * 12; // $2,376/yr
  const baseAnnualGeneration = 21250; // 14.76 kW system in TX
  const utilityEscalationRate = 0.04; // 4% historical Entergy escalation
  const degradationRate = 0.005; // 0.5%/year panel degradation
  const gridConnectionFeeAnnual = 15 * 12; // $15/mo basic customer grid fee

  const rows: YearScheduleRow[] = [];
  let cumulativeSavings = 0;

  for (let year = 1; year <= 25; year++) {
    const utilityWithoutSolar = initialAnnualUtilityCost * Math.pow(1 + utilityEscalationRate, year - 1);
    const solarGenerationKwh = Math.round(baseAnnualGeneration * Math.pow(1 - degradationRate, year - 1));
    const utilityWithSolar = gridConnectionFeeAnnual * Math.pow(1 + utilityEscalationRate, year - 1);
    const totalWithSolar = annualSolarPayment + utilityWithSolar;
    const annualSavings = utilityWithoutSolar - totalWithSolar;
    cumulativeSavings += annualSavings;

    rows.push({
      year,
      solarPayment: annualSolarPayment,
      utilityWithoutSolar: Math.round(utilityWithoutSolar * 100) / 100,
      utilityWithSolar: Math.round(utilityWithSolar * 100) / 100,
      totalWithSolar: Math.round(totalWithSolar * 100) / 100,
      annualSavings: Math.round(annualSavings * 100) / 100,
      cumulativeSavings: Math.round(cumulativeSavings * 100) / 100,
      solarGenerationKwh,
    });
  }

  return rows;
}

export function solarProposalScheduleToCsv(lead: Lead): string {
  const schedule = generate25YearSolarSchedule(lead);
  const headers = [
    'Year',
    'Sunrun Solar Payment ($/yr)',
    'Utility Cost Without Solar ($/yr)',
    'Residual Utility Bill With Solar ($/yr)',
    'Total Energy Cost With Solar ($/yr)',
    'Annual Savings ($)',
    'Cumulative Savings ($)',
    'Estimated Solar Output (kWh)',
  ];

  const rows = schedule.map((r) => [
    r.year,
    r.solarPayment.toFixed(2),
    r.utilityWithoutSolar.toFixed(2),
    r.utilityWithSolar.toFixed(2),
    r.totalWithSolar.toFixed(2),
    r.annualSavings.toFixed(2),
    r.cumulativeSavings.toFixed(2),
    r.solarGenerationKwh,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
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

export function getProposalUrl(lead: Lead): string {
  if (lead.name.toLowerCase().includes('patricia') || lead.id.includes('patricia')) {
    return '/documents/patricia-ferrell-sunrun-proposal.html';
  }
  return `/documents/patricia-ferrell-sunrun-proposal.html?leadId=${encodeURIComponent(lead.id)}`;
}

export function generateProposalEmailUrl(lead: Lead): string {
  const proposalUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${getProposalUrl(lead)}`
    : `https://thepowergenie.com${getProposalUrl(lead)}`;

  const subject = encodeURIComponent(`Sunrun Brightbox Solar & Storage Proposal for ${lead.name}`);
  const body = encodeURIComponent(
    `Hi ${lead.name},\n\n` +
    `Here is your custom Sunrun Brightbox™ Ownership Proposal for ${lead.address || 'your home'}:\n\n` +
    `• System Size: 14.76 kW DC (36× 410W Monocrystalline Panels)\n` +
    `• Storage: Tesla Powerwall 3 (13.5 kWh LFP Backup)\n` +
    `• Fixed Solar Payment: $198.00 / month ($0 down, 25-yr fixed loan)\n` +
    `• Federal Clean Energy Tax Credit (ITC): $14,170 (30%)\n` +
    `• Annual Bill Offset: 96.5%\n\n` +
    `View your interactive proposal and architectural CAD blueprint here:\n${proposalUrl}\n\n` +
    `Best regards,\n` +
    `Horace Lawrence · Sunrun Solar Advisor\n` +
    `The Power Genie Referral Partner\n` +
    `Phone: 800-368-3749`
  );

  return `mailto:${lead.email || ''}?subject=${subject}&body=${body}`;
}

export function generateProposalSmsUrl(lead: Lead): string {
  const proposalUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${getProposalUrl(lead)}`
    : `https://thepowergenie.com${getProposalUrl(lead)}`;

  const cleanPhone = (lead.phone || '').replace(/[^\d+]/g, '');
  const body = encodeURIComponent(
    `Hi ${lead.name}, here is your Sunrun 14.76 kW + Tesla Powerwall 3 solar proposal ($198/mo fixed, $0 down): ${proposalUrl}`
  );

  return `sms:${cleanPhone}?body=${body}`;
}
