import { describe, expect, it } from 'vitest';
import { buildProposal, generateProposalHtml } from './proposalBuilder';

describe('proposalBuilder', () => {
  it('builds a complete proposal from input parameters', () => {
    const proposal = buildProposal({
      customerName: 'Marcus Sterling',
      address: '4102 Westheimer Rd, Houston, TX 77027',
      panelCount: 24,
      panelWatts: 400,
      annualConsumptionKwh: 14000,
      ppaRateCents: 14.5,
      ppaEscalatorPct: 2.9,
      utilityRateCents: 18.2,
      includeBattery: true,
      batteryName: 'Tesla Powerwall 3',
    });

    expect(proposal.system.panels).toBe(24);
    expect(proposal.system.kw).toBe(9.6);
    expect(proposal.system.battery).toBe('Tesla Powerwall 3');
    expect(proposal.firstYearSavings).toBeGreaterThan(0);
    expect(proposal.twentyFiveYearSavings).toBeGreaterThan(1000);
    expect(proposal.schedule.length).toBe(25);
    expect(proposal.html).toContain('Solar Proposal for Marcus Sterling');
    expect(proposal.html).toContain('Tesla Powerwall 3');
  });

  it('handles default inputs gracefully when optional values are omitted', () => {
    const proposal = buildProposal({
      customerName: 'Elena Rostova',
      panelCount: 20,
      ppaRateCents: 13.0,
      ppaEscalatorPct: 0.0,
      includeBattery: false,
    });

    expect(proposal.system.panels).toBe(20);
    expect(proposal.system.kw).toBe(8.0);
    expect(proposal.system.battery).toBeNull();
    expect(proposal.html).toContain('Elena Rostova');
  });

  it('generates valid self-contained HTML for print and customer presentation', () => {
    const proposal = buildProposal({
      customerName: 'Devon Washington',
      panelCount: 28,
      ppaRateCents: 14.0,
      ppaEscalatorPct: 2.9,
      includeBattery: true,
    });

    const html = generateProposalHtml(proposal.snapshot);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Solar Proposal for Devon Washington');
    expect(html).toContain('First Year Monthly Savings');
    expect(html).toContain('25-Year Cumulative Savings');
  });
});
