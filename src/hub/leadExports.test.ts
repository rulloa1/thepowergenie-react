import { describe, expect, it } from 'vitest';
import {
  generate25YearSolarSchedule,
  generateProposalEmailUrl,
  generateProposalSmsUrl,
  leadsToCsvString,
  leadsToJsonString,
  solarProposalScheduleToCsv,
} from './leadExports';
import { PATRICIA_FERRELL_LEAD } from './useLeadFeed';

describe('leadExports', () => {
  it('formats leads into valid CSV with headers and escaped values', () => {
    const csv = leadsToCsvString([PATRICIA_FERRELL_LEAD]);
    expect(csv).toContain('ID,Name,Phone,Email,Address');
    expect(csv).toContain('Patricia Ferrell');
    expect(csv).toContain('9896 Hanna Ward Dr, Conroe, TX 77385-3215');
    expect(csv).toContain('795.24');
    expect(csv).toContain('AN14864224');
    expect(csv).toContain('option_b_ownership');
  });

  it('formats leads into JSON string', () => {
    const json = leadsToJsonString([PATRICIA_FERRELL_LEAD]);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Patricia Ferrell');
    expect(parsed[0].amount).toBe(795.24);
  });

  it('generates a 25-year solar amortization and energy savings schedule', () => {
    const schedule = generate25YearSolarSchedule(PATRICIA_FERRELL_LEAD);
    expect(schedule).toHaveLength(25);
    expect(schedule[0].year).toBe(1);
    expect(schedule[0].solarPayment).toBe(2376); // $198 * 12
    expect(schedule[0].solarGenerationKwh).toBe(21250);
    expect(schedule[24].year).toBe(25);
    // Cumulative savings grow over 25 years
    expect(schedule[24].cumulativeSavings).toBeGreaterThan(schedule[0].cumulativeSavings);
  });

  it('converts solar amortization schedule to CSV', () => {
    const csv = solarProposalScheduleToCsv(PATRICIA_FERRELL_LEAD);
    expect(csv).toContain('Year,Sunrun Solar Payment ($/yr),Utility Cost Without Solar ($/yr)');
    expect(csv).toContain('2376.00');
    expect(csv).toContain('21250');
  });

  it('constructs email and sms sharing URLs with proposal link and details', () => {
    const emailUrl = generateProposalEmailUrl(PATRICIA_FERRELL_LEAD);
    expect(emailUrl).toContain('mailto:patricia.ferrell@conroe-home.com');
    expect(emailUrl).toContain('Sunrun%20Brightbox');
    expect(emailUrl).toContain('14.76%20kW');

    const smsUrl = generateProposalSmsUrl(PATRICIA_FERRELL_LEAD);
    expect(smsUrl).toContain('sms:8003683749');
    expect(smsUrl).toContain('Sunrun');
  });
});
