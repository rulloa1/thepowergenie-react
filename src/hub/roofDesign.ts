export interface RoofPlane {
  id: string;
  name: string;
  pitchDeg: number;
  azimuthDeg: number;
  azimuthLabel: string;
  areaSqFt: number;
  maxPanels: number;
  activePanels: number;
  solarIrradianceKwhM2: number;
  efficiencyPct: number;
}

export type BatteryChoice = 'none' | 'powerwall_1' | 'powerwall_2';

export interface RoofDesignSpec {
  aerial?: import('../../shared/roofAerial').RoofAerialReview;
  id: string;
  address: string;
  leadId?: string;
  leadName?: string;
  panelCount: number;
  panelWattage: number;
  panelOrientation: 'portrait' | 'landscape';
  systemKw: number;
  annualProductionKwh: number;
  annualConsumptionKwh: number;
  offsetPct: number;
  battery: BatteryChoice;
  batteryName: string;
  batteryCapacityKwh: number;
  continuousPowerKw: number;
  estimatedBackupHours: number;
  utilityRateCents: number;
  ppaRateCents: number;
  estimatedMonthlySavings: number;
  firstYearSavings: number;
  twentyFiveYearSavings: number;
  co2TonsYear: number;
  treesEquivalent: number;
  fireSetbackCompliance: boolean;
  necClearanceFeet: number;
  planes: RoofPlane[];
  notes?: string;
  updatedAt: string;
}

const DEFAULT_ANNUAL_KWH = 12500;
const KWH_PER_KW_YEAR = 1420;
const DEFAULT_UTILITY_CENTS = 16.8;
const DEFAULT_PPA_CENTS = 12.5;

export function buildDefaultRoofDesign(
  address: string,
  annualConsumptionKwh?: number | null,
  initialPanels?: number | null,
  leadId?: string,
  leadName?: string,
): RoofDesignSpec {
  const consumption = annualConsumptionKwh && annualConsumptionKwh > 1000
    ? annualConsumptionKwh
    : DEFAULT_ANNUAL_KWH;

  // Size target: ~100% - 105% offset
  const targetKw = consumption / KWH_PER_KW_YEAR;
  const defaultPanelCount = Math.max(8, Math.min(48, Math.round((targetKw * 1000) / 400)));
  const panelCount = initialPanels && initialPanels > 0 ? initialPanels : defaultPanelCount;
  const panelWattage = 400;

  // Realistic roof facets for Texas residential architecture (South-facing main hip + SW & SE facets)
  const plane1Max = 20;
  const plane2Max = 14;
  const plane3Max = 12;

  let remaining = panelCount;
  const p1 = Math.min(remaining, plane1Max);
  remaining -= p1;
  const p2 = Math.min(remaining, plane2Max);
  remaining -= p2;
  const p3 = Math.min(remaining, plane3Max);

  const planes: RoofPlane[] = [
    {
      id: 'plane-south-main',
      name: 'Primary South Ridge',
      pitchDeg: 22,
      azimuthDeg: 180,
      azimuthLabel: 'South (180°)',
      areaSqFt: 820,
      maxPanels: plane1Max,
      activePanels: p1,
      solarIrradianceKwhM2: 1740,
      efficiencyPct: 98,
    },
    {
      id: 'plane-southwest',
      name: 'Southwest Hip',
      pitchDeg: 24,
      azimuthDeg: 225,
      azimuthLabel: 'Southwest (225°)',
      areaSqFt: 540,
      maxPanels: plane2Max,
      activePanels: p2,
      solarIrradianceKwhM2: 1650,
      efficiencyPct: 92,
    },
    {
      id: 'plane-southeast',
      name: 'Southeast Valley',
      pitchDeg: 20,
      azimuthDeg: 135,
      azimuthLabel: 'Southeast (135°)',
      areaSqFt: 460,
      maxPanels: plane3Max,
      activePanels: p3,
      solarIrradianceKwhM2: 1590,
      efficiencyPct: 88,
    },
  ];

  return recalculateRoofDesign({
    id: `roof-${Date.now()}`,
    address: address.trim() || '4102 Westheimer Rd, Houston, TX 77027',
    leadId,
    leadName,
    panelCount,
    panelWattage,
    panelOrientation: 'portrait',
    systemKw: 0,
    annualProductionKwh: 0,
    annualConsumptionKwh: consumption,
    offsetPct: 0,
    battery: 'powerwall_1',
    batteryName: '1x Tesla Powerwall 3 (13.5 kWh)',
    batteryCapacityKwh: 13.5,
    continuousPowerKw: 11.5,
    estimatedBackupHours: 24,
    utilityRateCents: DEFAULT_UTILITY_CENTS,
    ppaRateCents: DEFAULT_PPA_CENTS,
    estimatedMonthlySavings: 0,
    firstYearSavings: 0,
    twentyFiveYearSavings: 0,
    co2TonsYear: 0,
    treesEquivalent: 0,
    fireSetbackCompliance: true,
    necClearanceFeet: 3.0,
    planes,
    updatedAt: new Date().toISOString(),
  });
}

export function recalculateRoofDesign(
  base: RoofDesignSpec,
  updates?: Partial<{
    panelCount: number;
    panelWattage: number;
    panelOrientation: 'portrait' | 'landscape';
    battery: BatteryChoice;
    annualConsumptionKwh: number;
    address: string;
  }>,
): RoofDesignSpec {
  const panelCount = Math.max(1, Math.min(64, updates?.panelCount ?? base.panelCount));
  const panelWattage = updates?.panelWattage ?? base.panelWattage;
  const panelOrientation = updates?.panelOrientation ?? base.panelOrientation;
  const battery = updates?.battery ?? base.battery;
  const annualConsumptionKwh = updates?.annualConsumptionKwh ?? base.annualConsumptionKwh;
  const address = updates?.address ?? base.address;

  // System Size
  const systemKw = Number(((panelCount * panelWattage) / 1000).toFixed(2));

  // Re-allocate panels across facets
  let remaining = panelCount;
  const updatedPlanes = base.planes.map((plane) => {
    const allocated = Math.min(remaining, plane.maxPanels);
    remaining -= allocated;
    return { ...plane, activePanels: allocated };
  });

  // Calculate weighted production based on plane efficiencies
  let weightedFactor = 0;
  for (const plane of updatedPlanes) {
    weightedFactor += (plane.activePanels / panelCount) * (plane.efficiencyPct / 100);
  }
  if (!weightedFactor) weightedFactor = 0.95;

  const annualProductionKwh = Math.round(systemKw * KWH_PER_KW_YEAR * weightedFactor);
  const offsetPct = Math.round((annualProductionKwh / Math.max(1, annualConsumptionKwh)) * 100);

  // Financial calculations
  const utilityRate = base.utilityRateCents || DEFAULT_UTILITY_CENTS;
  const ppaRate = base.ppaRateCents || DEFAULT_PPA_CENTS;
  const currentCostWithoutSolar = (annualConsumptionKwh * utilityRate) / 100;
  const solarPpaCost = (annualProductionKwh * ppaRate) / 100;
  const remainingGridKwh = Math.max(0, annualConsumptionKwh - annualProductionKwh);
  const remainingGridCost = (remainingGridKwh * utilityRate) / 100;
  const newAnnualCost = solarPpaCost + remainingGridCost;
  const firstYearSavings = Math.max(0, Math.round(currentCostWithoutSolar - newAnnualCost));
  const estimatedMonthlySavings = Math.round(firstYearSavings / 12);
  const twentyFiveYearSavings = Math.round(firstYearSavings * 25 * 1.08); // accounting for modest utility escalation

  // Battery configuration
  let batteryName = 'None (Grid-tied)';
  let batteryCapacityKwh = 0;
  let continuousPowerKw = 0;
  let estimatedBackupHours = 0;

  if (battery === 'powerwall_1') {
    batteryName = '1x Tesla Powerwall 3 (13.5 kWh)';
    batteryCapacityKwh = 13.5;
    continuousPowerKw = 11.5;
    estimatedBackupHours = 24;
  } else if (battery === 'powerwall_2') {
    batteryName = '2x Tesla Powerwall 3 (27.0 kWh Whole-Home)';
    batteryCapacityKwh = 27.0;
    continuousPowerKw = 23.0;
    estimatedBackupHours = 48;
  }

  // Environmental impact
  const co2TonsYear = Number(((annualProductionKwh * 0.82) / 2000).toFixed(1));
  const treesEquivalent = Math.round(annualProductionKwh * 0.016);

  // NEC 2023 3-foot ridge fire setback compliance
  const totalCapacityPanels = updatedPlanes.reduce((acc, p) => acc + p.maxPanels, 0);
  const fireSetbackCompliance = panelCount <= totalCapacityPanels;

  return {
    ...base,
    address,
    panelCount,
    panelWattage,
    panelOrientation,
    systemKw,
    annualProductionKwh,
    annualConsumptionKwh,
    offsetPct,
    battery,
    batteryName,
    batteryCapacityKwh,
    continuousPowerKw,
    estimatedBackupHours,
    estimatedMonthlySavings,
    firstYearSavings,
    twentyFiveYearSavings,
    co2TonsYear,
    treesEquivalent,
    fireSetbackCompliance,
    planes: updatedPlanes,
    updatedAt: new Date().toISOString(),
  };
}

const ROOF_DESIGN_TOKEN_REGEX = /<!--roof-design:([\s\S]*?)-->/;
const ROOF_DESIGN_STORAGE_PREFIX = 'powergenie:roof-design:';

export function serializeRoofDesign(spec: RoofDesignSpec): string {
  try {
    return `<!--roof-design:${JSON.stringify(spec)}-->`;
  } catch {
    return '';
  }
}

export function parseRoofDesignFromNotes(notes?: string | null): RoofDesignSpec | null {
  if (!notes) return null;
  const match = ROOF_DESIGN_TOKEN_REGEX.exec(notes);
  if (!match || !match[1]) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed && typeof parsed === 'object' && typeof parsed.panelCount === 'number' && Array.isArray(parsed.planes)) {
      return parsed as RoofDesignSpec;
    }
  } catch {
    // Ignore invalid JSON
  }
  return null;
}

export function stripRoofDesignFromNotes(notes?: string | null): string {
  if (!notes) return '';
  return notes.replace(ROOF_DESIGN_TOKEN_REGEX, '').trim();
}

export function saveLeadRoofDesign(leadId: string, spec: RoofDesignSpec): void {
  if (!leadId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${ROOF_DESIGN_STORAGE_PREFIX}${leadId}`, JSON.stringify(spec));
  } catch {
    // LocalStorage write fail ignored
  }
}

export function getSavedRoofDesign(leadId: string): RoofDesignSpec | null {
  if (!leadId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${ROOF_DESIGN_STORAGE_PREFIX}${leadId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.panelCount === 'number' && Array.isArray(parsed.planes)) {
      return parsed as RoofDesignSpec;
    }
  } catch {
    // LocalStorage read fail ignored
  }
  return null;
}

export function clearSavedRoofDesign(leadId: string): void {
  if (!leadId || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(`${ROOF_DESIGN_STORAGE_PREFIX}${leadId}`);
  } catch {
    // LocalStorage remove fail ignored
  }
}

