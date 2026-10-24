import { describe, expect, it } from 'vitest';
import {
  generate25YearSolarSchedule,
  generateProposalEmailUrl,
  generateProposalSmsUrl,
  leadsToCsvString,
  leadsToJsonString,
  solarProposalScheduleToCsv,
} from './leadExports';
import type { Lead } from './useLeadFeed';

const MOCK_SOLAR_LEAD: Lead = {
  id: 'lead-mock-solar-123',
  source: 'customer',
  sourceLabel: 'Sunrun Option B Workflow',
  createdAt: '2026-09-23T16:45:00.000Z',
  name: 'Alex Morgan',
  phone: '800-555-0199',
  email: 'alex.morgan@example.com',
  address: '1000 Solar Way, Austin, TX 78701',
  kwh: 2500,
  amount: 600.00,
  pastDue: 200.00,
  currentCharges: 400.00,
  appointment: '2026-10-24T15:00:00.000Z',
  esiid: '10000000000000001',
  meterNumber: 'MTR-123456',
  accountNumber: 'ACC-888888',
  tdu: 'CenterPoint Energy',
  repPuctCertificate: 'REP-10001',
  avgMonthlyKwh: 1750,
  notes: 'Option B solar ownership consultation',
  usageHistory: [
    { month: '2026-08', kwh: 2400 },
    { month: '2026-09', kwh: 2500 },
  ],
  bill: null,
  cancelled: false,
  unseen: false,
};

describe('leadExports', () => {
  it('formats leads into valid CSV with headers and escaped values', () => {
    const csv = leadsToCsvString([MOCK_SOLAR_LEAD]);
    expect(csv).toContain('ID,Name,Phone,Email,Address');
    expect(csv).toContain('Alex Morgan');
    expect(csv).toContain('1000 Solar Way, Austin, TX 78701');
    expect(csv).toContain('600.00');
    expect(csv).toContain('MTR-123456');
    expect(csv).toContain('ACC-888888');
  });

  it('formats leads into JSON string', () => {
    const json = leadsToJsonString([MOCK_SOLAR_LEAD]);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Alex Morgan');
    expect(parsed[0].amount).toBe(600.00);
  });

  it('generates a 25-year solar amortization and energy savings schedule', () => {
    const schedule = generate25YearSolarSchedule(MOCK_SOLAR_LEAD);
    expect(schedule).toHaveLength(25);
    expect(schedule[0].year).toBe(1);
    expect(schedule[0].solarPayment).toBe(2376); // $198 * 12
    expect(schedule[0].solarGenerationKwh).toBe(21250);
    expect(schedule[24].year).toBe(25);
    // Cumulative savings grow over 25 years
    expect(schedule[24].cumulativeSavings).toBeGreaterThan(schedule[0].cumulativeSavings);
  });

  it('converts solar amortization schedule to CSV', () => {
    const csv = solarProposalScheduleToCsv(MOCK_SOLAR_LEAD);
    expect(csv).toContain('Year,Sunrun Solar Payment ($/yr),Utility Cost Without Solar ($/yr)');
    expect(csv).toContain('2376.00');
    expect(csv).toContain('21250');
  });

  it('constructs email and sms sharing URLs with proposal link and details', () => {
    const emailUrl = generateProposalEmailUrl(MOCK_SOLAR_LEAD);
    expect(emailUrl).toContain('mailto:alex.morgan@example.com');
    expect(emailUrl).toContain('Sunrun%20Brightbox');
    expect(emailUrl).toContain('14.76%20kW');

    const smsUrl = generateProposalSmsUrl(MOCK_SOLAR_LEAD);
    expect(smsUrl).toContain('sms:8005550199');
    expect(smsUrl).toContain('Sunrun');
  });
});
