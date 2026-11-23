import { describe, expect, it } from 'vitest';
import {
  buildDefaultRoofDesign,
  parseRoofDesignFromNotes,
  recalculateRoofDesign,
  serializeRoofDesign,
  stripRoofDesignFromNotes,
} from './roofDesign';

describe('roofDesign calculation engine', () => {
  it('builds a balanced default roof design for an address', () => {
    const spec = buildDefaultRoofDesign('4102 Westheimer Rd, Houston, TX 77027', 12500);

    expect(spec.address).toBe('4102 Westheimer Rd, Houston, TX 77027');
    expect(spec.panelCount).toBeGreaterThanOrEqual(18);
    expect(spec.systemKw).toBeGreaterThan(6);
    expect(spec.annualProductionKwh).toBeGreaterThan(8000);
    expect(spec.offsetPct).toBeGreaterThanOrEqual(80);
    expect(spec.battery).toBe('powerwall_1');
    expect(spec.fireSetbackCompliance).toBe(true);
    expect(spec.planes.length).toBe(3);
  });

  it('recalculates metrics dynamically when panel count changes', () => {
    const base = buildDefaultRoofDesign('1422 Yale St, Houston, TX 77008', 12000);
    const updated = recalculateRoofDesign(base, { panelCount: 28 });

    expect(updated.panelCount).toBe(28);
    expect(updated.systemKw).toBe(11.2); // 28 * 400W / 1000 = 11.2 kW
    expect(updated.annualProductionKwh).toBeGreaterThan(base.annualProductionKwh);
    expect(updated.estimatedMonthlySavings).toBeGreaterThan(0);
  });

  it('updates energy storage capacity and duration when battery changes', () => {
    const base = buildDefaultRoofDesign('1422 Yale St, Houston, TX 77008', 12000);

    const withDual = recalculateRoofDesign(base, { battery: 'powerwall_2' });
    expect(withDual.batteryCapacityKwh).toBe(27.0);
    expect(withDual.continuousPowerKw).toBe(23.0);
    expect(withDual.estimatedBackupHours).toBe(48);

    const noBattery = recalculateRoofDesign(base, { battery: 'none' });
    expect(noBattery.batteryCapacityKwh).toBe(0);
    expect(noBattery.continuousPowerKw).toBe(0);
    expect(noBattery.estimatedBackupHours).toBe(0);
  });

  it('serializes, parses, and strips roof designs in lead notes roundtrip', () => {
    const base = buildDefaultRoofDesign('1422 Yale St, Houston, TX 77008', 12000, 24);
    const token = serializeRoofDesign(base);
    expect(token).toContain('<!--roof-design:');

    const notes = `Initial notes from customer consult.\n${token}`;
    const parsed = parseRoofDesignFromNotes(notes);
    expect(parsed).not.toBeNull();
    expect(parsed?.panelCount).toBe(24);
    expect(parsed?.address).toBe('1422 Yale St, Houston, TX 77008');

    const clean = stripRoofDesignFromNotes(notes);
    expect(clean).toBe('Initial notes from customer consult.');
    expect(parseRoofDesignFromNotes(clean)).toBeNull();
  });
});
