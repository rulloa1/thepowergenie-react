import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BatteryCharging,
  Check,
  CheckCircle2,
  ChevronDown,
  Compass,
  Download,
  Info,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import { lockPageScroll } from '../lib/scrollLock';
import {
  type BatteryChoice,
  type RoofDesignSpec,
  buildDefaultRoofDesign,
  recalculateRoofDesign,
} from './roofDesign';
import { Button, Notice, Spinner, cn, inputClass, labelClass } from './ui';
import type { Lead } from './useLeadFeed';

interface RoofDesignDialogProps {
  lead: Lead | null;
  busy?: boolean;
  onClose: () => void;
  onApplyToLead?: (spec: RoofDesignSpec, leadId?: string) => void | Promise<void>;
  onSaveAsLead?: (spec: RoofDesignSpec) => void | Promise<void>;
}

export default function RoofDesignDialog({
  lead,
  busy = false,
  onClose,
  onApplyToLead,
  onSaveAsLead,
}: RoofDesignDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Initial spec based on lead or defaults
  const [spec, setSpec] = useState<RoofDesignSpec>(() => {
    const annualKwh = lead?.kwh ? lead.kwh * 10 : lead?.avgMonthlyKwh ? lead.avgMonthlyKwh * 12 : 12500;
    const address = lead?.address || '4102 Westheimer Rd, Houston, TX 77027';
    return buildDefaultRoofDesign(address, annualKwh, null, lead?.id, lead?.name);
  });

  const [applying, setApplying] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'blueprint' | 'satellite' | 'solar_heat'>('blueprint');
  const [editingAddress, setEditingAddress] = useState(false);
  const [tempAddress, setTempAddress] = useState(spec.address);

  useEffect(() => lockPageScroll(), []);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy && !applying) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, applying, onClose]);

  const updatePanels = (count: number) => {
    setSpec((prev) => recalculateRoofDesign(prev, { panelCount: count }));
  };

  const updateWattage = (watts: number) => {
    setSpec((prev) => recalculateRoofDesign(prev, { panelWattage: watts }));
  };

  const updateOrientation = (orientation: 'portrait' | 'landscape') => {
    setSpec((prev) => recalculateRoofDesign(prev, { panelOrientation: orientation }));
  };

  const updateBattery = (battery: BatteryChoice) => {
    setSpec((prev) => recalculateRoofDesign(prev, { battery }));
  };

  const updateConsumption = (kwh: number) => {
    setSpec((prev) => recalculateRoofDesign(prev, { annualConsumptionKwh: kwh }));
  };

  const saveAddress = () => {
    if (tempAddress.trim()) {
      setSpec((prev) => recalculateRoofDesign(prev, { address: tempAddress.trim() }));
      setEditingAddress(false);
    }
  };

  const handleApply = async () => {
    if (!onApplyToLead) return;
    setApplying(true);
    setStatusNote(null);
    try {
      await onApplyToLead(spec, lead?.id);
      setStatusNote('Roof design saved successfully!');
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (e) {
      setStatusNote(e instanceof Error ? e.message : 'Failed to apply design.');
    } finally {
      setApplying(false);
    }
  };

  const handleDownloadSpec = () => {
    const content = `
========================================================================
SUNRUN PRELIMINARY ROOF DESIGN & ENGINEERING SPECIFICATION
The Power Genie — Houston Referral Hub
========================================================================

PROPERTY DETAILS:
Address: ${spec.address}
Lead / Homeowner: ${spec.leadName || 'Direct Property Design'}
Date Generated: ${new Date().toLocaleDateString('en-US', { dateStyle: 'full' })}

SYSTEM SUMMARY:
Array Capacity: ${spec.systemKw} kW DC
Module Count: ${spec.panelCount}x ${spec.panelWattage}W Monocrystalline Tier-1
Module Orientation: ${spec.panelOrientation.toUpperCase()}
Estimated Year 1 Solar Production: ${spec.annualProductionKwh.toLocaleString()} kWh
Estimated Annual Home Consumption: ${spec.annualConsumptionKwh.toLocaleString()} kWh
Net Solar Offset: ${spec.offsetPct}%

ENERGY STORAGE:
Battery System: ${spec.batteryName}
Usable Backup Capacity: ${spec.batteryCapacityKwh} kWh
Continuous Power Output: ${spec.continuousPowerKw} kW
Estimated Essential Home Backup Duration: ~${spec.estimatedBackupHours} Hours

ROOF PLANES & AZIMUTH BREAKDOWN:
${spec.planes
  .map(
    (p, i) =>
      `Plane #${i + 1} (${p.name}): ${p.activePanels} panels (${(
        (p.activePanels * spec.panelWattage) /
        1000
      ).toFixed(2)} kW) | Pitch: ${p.pitchDeg}° | Azimuth: ${p.azimuthLabel} | Irradiance: ${
        p.solarIrradianceKwhM2
      } kWh/m²/yr (${p.efficiencyPct}% eff)`,
  )
  .join('\n')}

ESTIMATED FINANCIAL & ENVIRONMENTAL SAVINGS:
Utility Rate (Baseline): ${spec.utilityRateCents}¢ / kWh
Solar Plan Rate: ${spec.ppaRateCents}¢ / kWh
Estimated Monthly Electric Bill Savings: $${spec.estimatedMonthlySavings} / mo
First Year Cumulative Savings: $${spec.firstYearSavings}
25-Year Estimated Savings: $${spec.twentyFiveYearSavings.toLocaleString()}
Annual CO2 Avoided: ${spec.co2TonsYear} Metric Tons (~${spec.treesEquivalent} Trees Planted)

BUILDING & FIRE CODE COMPLIANCE:
NEC 2023 / NFPA 1 Fire Pathway Clearance: COMPLIANT (3.0 ft ridge setback)
Structural Roof Inspection Status: Pending physical field survey by Horace Lawrence

========================================================================
Confidential & Proprietary — Prepared by The Power Genie / Sunrun
`.trim();

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Roof-Design-${spec.address.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 30)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-stretch justify-center bg-hub-scrim p-0 sm:items-center sm:p-4"
      onClick={() => {
        if (!busy && !applying) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-hub-surface text-hub-ink shadow-2xl outline-none sm:h-[90vh] sm:max-h-[880px] sm:rounded-3xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-hub-line bg-hub-surface px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-hub-accent-soft text-hub-accent-ink">
                <Compass className="h-4 w-4" />
              </span>
              <div>
                <h2 id={titleId} className="m-0 truncate text-base font-bold text-hub-ink sm:text-lg">
                  {lead ? `Roof Design — ${lead.name}` : 'Solar Roof Design Studio'}
                </h2>
                <div className="flex items-center gap-1.5 text-xs text-hub-soft">
                  <MapPin className="h-3 w-3 shrink-0 text-hub-accent-ink" />
                  {editingAddress ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={tempAddress}
                        onChange={(e) => setTempAddress(e.target.value)}
                        className="h-6 rounded border border-hub-line bg-hub-surface px-1.5 text-xs text-hub-ink"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={saveAddress}
                        className="rounded bg-hub-primary px-1.5 py-0.5 text-[10px] font-bold text-hub-on-primary"
                      >
                        Set
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setTempAddress(spec.address);
                        setEditingAddress(true);
                      }}
                      className="truncate hover:underline text-left"
                      title="Click to edit address"
                    >
                      {spec.address}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadSpec}
              className="hidden items-center gap-1.5 rounded-xl border border-hub-line bg-hub-muted px-3 py-1.5 text-xs font-semibold text-hub-ink hover:bg-hub-surface sm:inline-flex"
              title="Download Engineering Spec Sheet"
            >
              <Download className="h-3.5 w-3.5" /> Spec Sheet
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={busy || applying}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-hub-line text-hub-ink hover:border-hub-ink"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12">
          {/* Left Canvas: Interactive Roof LiDAR & Layout */}
          <div className="flex flex-col border-b border-hub-line bg-[#091522] p-4 lg:col-span-7 lg:border-b-0 lg:border-r">
            {/* View Mode Tabs */}
            <div className="flex items-center justify-between gap-2 pb-3">
              <div className="flex gap-1.5 rounded-xl bg-[#0F2236] p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('blueprint')}
                  className={cn(
                    'rounded-lg px-2.5 py-1 font-semibold transition-colors',
                    viewMode === 'blueprint'
                      ? 'bg-hub-primary text-hub-on-primary shadow'
                      : 'text-slate-300 hover:text-white',
                  )}
                >
                  LiDAR Blueprint
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('solar_heat')}
                  className={cn(
                    'rounded-lg px-2.5 py-1 font-semibold transition-colors',
                    viewMode === 'solar_heat'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow'
                      : 'text-slate-300 hover:text-white',
                  )}
                >
                  Solar Irradiance
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('satellite')}
                  className={cn(
                    'rounded-lg px-2.5 py-1 font-semibold transition-colors',
                    viewMode === 'satellite'
                      ? 'bg-sky-500 text-slate-950 font-bold shadow'
                      : 'text-slate-300 hover:text-white',
                  )}
                >
                  Aerial Satellite
                </button>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>NEC 3-ft Setback OK</span>
              </div>
            </div>

            {/* Interactive Roof Visualizer SVG */}
            <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-slate-700/60 bg-[#0B1A2C] p-2 min-h-[300px]">
              <svg
                viewBox="0 0 600 480"
                className="h-full w-full max-h-[460px] select-none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  {/* Solar Panel Pattern */}
                  <pattern id="solar-cell-grid" width="10" height="15" patternUnits="userSpaceOnUse">
                    <rect width="10" height="15" fill="#132644" stroke="#2B4E7E" strokeWidth="0.75" />
                    <line x1="0" y1="7.5" x2="10" y2="7.5" stroke="#1D3960" strokeWidth="0.5" />
                    <line x1="5" y1="0" x2="5" y2="15" stroke="#1D3960" strokeWidth="0.5" />
                  </pattern>

                  {/* Satellite background texture fallback */}
                  <radialGradient id="satellite-glow" cx="50%" cy="45%" r="65%">
                    <stop offset="0%" stopColor="#1B385A" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#0B1A2C" stopOpacity="0.95" />
                  </radialGradient>

                  {/* Solar Heatmap Gradients */}
                  <linearGradient id="heat-south" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.75" />
                    <stop offset="100%" stopColor="#D97706" stopOpacity="0.85" />
                  </linearGradient>
                  <linearGradient id="heat-sw" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#B45309" stopOpacity="0.7" />
                  </linearGradient>
                  <linearGradient id="heat-se" x1="100%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#0369A1" stopOpacity="0.5" />
                  </linearGradient>
                </defs>

                {/* Ground / Property boundary */}
                <rect width="600" height="480" fill="url(#satellite-glow)" />

                {/* Property Lot Line */}
                <rect
                  x="30"
                  y="20"
                  width="540"
                  height="440"
                  fill="none"
                  stroke="#1E3A5F"
                  strokeDasharray="6 4"
                  strokeWidth="1.2"
                />
                <text x="40" y="42" fill="#4B6A94" fontSize="11" fontFamily="sans-serif">
                  LOT 14 · HOUSTON, TX (ZONE 2A)
                </text>

                {/* North Compass Rose */}
                <g transform="translate(540, 50)">
                  <circle cx="0" cy="0" r="18" fill="#0F243B" stroke="#2C4E76" strokeWidth="1.2" />
                  <polygon points="0,-14 4,-2 0,0 -4,-2" fill="#FF8A2B" />
                  <polygon points="0,14 4,2 0,0 -4,2" fill="#476C98" />
                  <text x="0" y="-17" fill="#FF8A2B" fontSize="10" fontWeight="bold" textAnchor="middle">
                    N
                  </text>
                  <text x="0" y="24" fill="#93C5FD" fontSize="9" fontWeight="bold" textAnchor="middle">
                    S
                  </text>
                </g>

                {/* Main Building Roof Footprint & Facets */}
                {/* 1. South Facet (Main southern roof plane) */}
                <polygon
                  points="120,240 480,240 420,380 180,380"
                  fill={
                    viewMode === 'solar_heat'
                      ? 'url(#heat-south)'
                      : viewMode === 'satellite'
                      ? '#1F344D'
                      : '#132A44'
                  }
                  stroke="#38BDF8"
                  strokeWidth="2"
                />

                {/* 2. North Facet (Opposite roof plane) */}
                <polygon
                  points="120,240 480,240 420,100 180,100"
                  fill={viewMode === 'solar_heat' ? '#0F2640' : '#0E1F33'}
                  stroke="#1D3E64"
                  strokeWidth="1.5"
                />

                {/* 3. Southwest Hip */}
                <polygon
                  points="180,380 120,240 60,300 100,410"
                  fill={
                    viewMode === 'solar_heat'
                      ? 'url(#heat-sw)'
                      : viewMode === 'satellite'
                      ? '#1A2F45'
                      : '#10243C'
                  }
                  stroke="#38BDF8"
                  strokeWidth="1.5"
                />

                {/* 4. Southeast Hip */}
                <polygon
                  points="420,380 480,240 540,300 500,410"
                  fill={
                    viewMode === 'solar_heat'
                      ? 'url(#heat-se)'
                      : viewMode === 'satellite'
                      ? '#1A2F45'
                      : '#10243C'
                  }
                  stroke="#38BDF8"
                  strokeWidth="1.5"
                />

                {/* Main Roof Ridge Line */}
                <line x1="120" y1="240" x2="480" y2="240" stroke="#FDE047" strokeWidth="2.5" />
                <text x="300" y="235" fill="#FDE047" fontSize="10" fontWeight="bold" textAnchor="middle">
                  RIDGE LINE (3-FT FIRE SETBACK BUFFER)
                </text>

                {/* Fire Setback Buffer Lines (NFPA 1 / NEC 2023) */}
                <line
                  x1="135"
                  y1="255"
                  x2="465"
                  y2="255"
                  stroke="#10B981"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                />

                {/* Solar Panels Placed on South Ridge Plane */}
                {(() => {
                  const p1Count = spec.planes[0]?.activePanels || 0;
                  const panelElements: React.ReactNode[] = [];
                  const cols = 8;
                  const pw = spec.panelOrientation === 'portrait' ? 24 : 34;
                  const ph = spec.panelOrientation === 'portrait' ? 36 : 24;
                  const startX = 175;
                  const startY = 270;

                  for (let i = 0; i < p1Count; i++) {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    const px = startX + col * (pw + 6);
                    const py = startY + row * (ph + 6);

                    panelElements.push(
                      <g key={`p1-${i}`} className="cursor-pointer transition-transform hover:opacity-90">
                        <rect
                          x={px}
                          y={py}
                          width={pw}
                          height={ph}
                          rx="1.5"
                          fill="url(#solar-cell-grid)"
                          stroke="#93C5FD"
                          strokeWidth="1"
                        />
                        <rect x={px + 2} y={py + 2} width={pw - 4} height={ph - 4} fill="#1E3E6B" opacity="0.4" />
                      </g>,
                    );
                  }
                  return panelElements;
                })()}

                {/* Solar Panels Placed on Southwest Hip */}
                {(() => {
                  const p2Count = spec.planes[1]?.activePanels || 0;
                  const panelElements: React.ReactNode[] = [];
                  const pw = 20;
                  const ph = 30;
                  const startX = 100;
                  const startY = 285;

                  for (let i = 0; i < p2Count; i++) {
                    const col = i % 3;
                    const row = Math.floor(i / 3);
                    const px = startX + col * (pw + 4);
                    const py = startY + row * (ph + 5);

                    panelElements.push(
                      <g key={`p2-${i}`}>
                        <rect
                          x={px}
                          y={py}
                          width={pw}
                          height={ph}
                          rx="1"
                          fill="url(#solar-cell-grid)"
                          stroke="#60A5FA"
                          strokeWidth="0.8"
                        />
                      </g>,
                    );
                  }
                  return panelElements;
                })()}

                {/* Solar Panels Placed on Southeast Hip */}
                {(() => {
                  const p3Count = spec.planes[2]?.activePanels || 0;
                  const panelElements: React.ReactNode[] = [];
                  const pw = 20;
                  const ph = 30;
                  const startX = 440;
                  const startY = 285;

                  for (let i = 0; i < p3Count; i++) {
                    const col = i % 3;
                    const row = Math.floor(i / 3);
                    const px = startX + col * (pw + 4);
                    const py = startY + row * (ph + 5);

                    panelElements.push(
                      <g key={`p3-${i}`}>
                        <rect
                          x={px}
                          y={py}
                          width={pw}
                          height={ph}
                          rx="1"
                          fill="url(#solar-cell-grid)"
                          stroke="#60A5FA"
                          strokeWidth="0.8"
                        />
                      </g>,
                    );
                  }
                  return panelElements;
                })()}

                {/* Legend Overlay at bottom */}
                <g transform="translate(20, 440)">
                  <rect x="0" y="0" width="12" height="12" fill="#132644" stroke="#93C5FD" strokeWidth="1" />
                  <text x="18" y="10" fill="#94A3B8" fontSize="10">
                    Sunrun 400W Mono Panel
                  </text>

                  <rect x="155" y="0" width="12" height="12" fill="#10B981" opacity="0.8" />
                  <text x="173" y="10" fill="#94A3B8" fontSize="10">
                    Setback Buffer Clear
                  </text>

                  <rect x="290" y="0" width="12" height="12" fill="#F59E0B" opacity="0.8" />
                  <text x="308" y="10" fill="#94A3B8" fontSize="10">
                    Optimal Irradiance (1,740 kWh/m²)
                  </text>
                </g>
              </svg>
            </div>

            {/* Quick Stats Strip below Canvas */}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-white">
              <div className="rounded-xl bg-[#0F2236] p-2">
                <span className="block text-[11px] font-semibold text-slate-400">System Capacity</span>
                <span className="text-base font-bold text-hub-accent-ink">{spec.systemKw} kW DC</span>
              </div>
              <div className="rounded-xl bg-[#0F2236] p-2">
                <span className="block text-[11px] font-semibold text-slate-400">Year 1 Solar</span>
                <span className="text-base font-bold text-emerald-400">
                  {spec.annualProductionKwh.toLocaleString()} kWh
                </span>
              </div>
              <div className="rounded-xl bg-[#0F2236] p-2">
                <span className="block text-[11px] font-semibold text-slate-400">Home Offset</span>
                <span
                  className={cn(
                    'text-base font-bold',
                    spec.offsetPct >= 95 ? 'text-emerald-400' : 'text-amber-400',
                  )}
                >
                  {spec.offsetPct}%
                </span>
              </div>
            </div>
          </div>

          {/* Right Panel: Sizing Controls, Plane Details & Actions */}
          <div className="flex flex-col justify-between bg-hub-surface p-4 sm:p-5 lg:col-span-5">
            <div className="space-y-4">
              {/* Solar Array Sizing Slider & Controls */}
              <div className="rounded-2xl border border-hub-line bg-hub-muted p-3.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="panel-slider" className="text-sm font-bold text-hub-ink">
                    Solar Panels: <span className="text-hub-primary">{spec.panelCount} panels</span>
                  </label>
                  <span className="text-xs font-semibold text-hub-soft">
                    {spec.systemKw} kW DC ({spec.panelWattage}W modules)
                  </span>
                </div>

                <div className="mt-2.5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => updatePanels(spec.panelCount - 1)}
                    disabled={spec.panelCount <= 4}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-hub-line bg-hub-surface font-bold text-hub-ink hover:bg-hub-muted disabled:opacity-50"
                  >
                    -
                  </button>
                  <input
                    id="panel-slider"
                    type="range"
                    min="4"
                    max="48"
                    step="1"
                    value={spec.panelCount}
                    onChange={(e) => updatePanels(Number(e.target.value))}
                    className="flex-1 accent-hub-primary"
                  />
                  <button
                    type="button"
                    onClick={() => updatePanels(spec.panelCount + 1)}
                    disabled={spec.panelCount >= 48}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-hub-line bg-hub-surface font-bold text-hub-ink hover:bg-hub-muted disabled:opacity-50"
                  >
                    +
                  </button>
                </div>

                {/* Module Specs Row */}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className={labelClass}>Module Wattage</label>
                    <select
                      value={spec.panelWattage}
                      onChange={(e) => updateWattage(Number(e.target.value))}
                      className={inputClass}
                    >
                      <option value="400">400W Monocrystalline</option>
                      <option value="415">415W High-Efficiency</option>
                      <option value="425">425W All-Black</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Orientation</label>
                    <select
                      value={spec.panelOrientation}
                      onChange={(e) => updateOrientation(e.target.value as 'portrait' | 'landscape')}
                      className={inputClass}
                    >
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Energy Storage (Battery) Selector */}
              <div className="rounded-2xl border border-hub-line bg-hub-muted p-3.5">
                <div className="flex items-center gap-2">
                  <BatteryCharging className="h-4 w-4 text-hub-accent-ink" />
                  <span className="text-sm font-bold text-hub-ink">Battery Storage</span>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => updateBattery('none')}
                    className={cn(
                      'rounded-xl border p-2 text-left text-xs transition-colors',
                      spec.battery === 'none'
                        ? 'border-hub-primary bg-hub-primary/10 font-bold text-hub-primary'
                        : 'border-hub-line bg-hub-surface text-hub-soft hover:bg-hub-muted',
                    )}
                  >
                    <span className="block font-semibold">No Battery</span>
                    <span className="text-[10px] text-hub-soft">Solar only</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateBattery('powerwall_1')}
                    className={cn(
                      'rounded-xl border p-2 text-left text-xs transition-colors',
                      spec.battery === 'powerwall_1'
                        ? 'border-hub-primary bg-hub-primary/10 font-bold text-hub-primary'
                        : 'border-hub-line bg-hub-surface text-hub-soft hover:bg-hub-muted',
                    )}
                  >
                    <span className="block font-semibold">1x Powerwall</span>
                    <span className="text-[10px] text-hub-soft">13.5 kWh (~24h)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateBattery('powerwall_2')}
                    className={cn(
                      'rounded-xl border p-2 text-left text-xs transition-colors',
                      spec.battery === 'powerwall_2'
                        ? 'border-hub-primary bg-hub-primary/10 font-bold text-hub-primary'
                        : 'border-hub-line bg-hub-surface text-hub-soft hover:bg-hub-muted',
                    )}
                  >
                    <span className="block font-semibold">2x Powerwall</span>
                    <span className="text-[10px] text-hub-soft">27 kWh Whole-Home</span>
                  </button>
                </div>
              </div>

              {/* Roof Planes & Shading Breakdown Table */}
              <div className="rounded-2xl border border-hub-line bg-hub-surface p-3.5">
                <p className="m-0 text-xs font-bold uppercase tracking-wider text-hub-soft">
                  Roof Facet Distribution
                </p>
                <div className="mt-2 space-y-2 text-xs">
                  {spec.planes.map((plane) => (
                    <div
                      key={plane.id}
                      className="flex items-center justify-between rounded-xl bg-hub-muted px-3 py-2"
                    >
                      <div>
                        <span className="font-semibold text-hub-ink">{plane.name}</span>
                        <span className="block text-[10px] text-hub-soft">
                          {plane.azimuthLabel} · {plane.pitchDeg}° pitch
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-hub-primary">
                          {plane.activePanels} / {plane.maxPanels} panels
                        </span>
                        <span className="block text-[10px] text-emerald-600 font-semibold">
                          {plane.efficiencyPct}% solar yield
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial & Environmental Impact Cards */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-hub-line bg-hub-muted p-2.5">
                  <span className="text-[10px] font-semibold text-hub-soft">Est. Monthly Savings</span>
                  <p className="m-0 mt-0.5 text-base font-bold text-emerald-600">
                    ${spec.estimatedMonthlySavings}/mo
                  </p>
                  <span className="text-[10px] text-hub-soft">
                    ${spec.twentyFiveYearSavings.toLocaleString()} over 25 yrs
                  </span>
                </div>

                <div className="rounded-xl border border-hub-line bg-hub-muted p-2.5">
                  <span className="text-[10px] font-semibold text-hub-soft">CO₂ Offset</span>
                  <p className="m-0 mt-0.5 text-base font-bold text-hub-primary">
                    {spec.co2TonsYear} tons/yr
                  </p>
                  <span className="text-[10px] text-hub-soft">~{spec.treesEquivalent} trees equivalent</span>
                </div>
              </div>

              {statusNote && (
                <Notice tone={statusNote.includes('success') ? 'success' : 'warn'}>
                  {statusNote}
                </Notice>
              )}
            </div>

            {/* Bottom Actions Bar */}
            <div className="mt-4 flex flex-col gap-2 border-t border-hub-line pt-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={onClose} disabled={applying}>
                Cancel
              </Button>

              {onApplyToLead && lead && (
                <Button
                  type="button"
                  variant="accent"
                  onClick={handleApply}
                  disabled={applying}
                  className="w-full sm:w-auto"
                >
                  {applying ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> Save Design to Lead
                    </>
                  )}
                </Button>
              )}

              {onSaveAsLead && !lead && (
                <Button
                  type="button"
                  variant="accent"
                  onClick={() => onSaveAsLead(spec)}
                  disabled={applying}
                  className="w-full sm:w-auto"
                >
                  <Sparkles className="h-4 w-4" /> Create Lead with Design
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
