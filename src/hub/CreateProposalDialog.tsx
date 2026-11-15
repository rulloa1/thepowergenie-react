import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BatteryCharging,
  Check,
  CheckCircle2,
  Copy,
  DollarSign,
  Download,
  Eye,
  FileText,
  Printer,
  Send,
  Sliders,
  Sparkles,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import { lockPageScroll } from '../lib/scrollLock';
import { HTML_PREVIEW_SANDBOX } from './htmlDocument';
import type { Lead } from './useLeadFeed';
import {
  buildProposal,
  type BuiltProposal,
  type ProposalInputParams,
} from './proposalBuilder';
import { Button, cn, inputClass, labelClass } from './ui';

export interface CreateProposalDialogProps {
  lead: Lead | null;
  allLeads?: Lead[];
  onClose: () => void;
  onSave?: (leadId: string, proposal: BuiltProposal) => void;
  onApproveAndSend?: (leadId: string, proposal: BuiltProposal) => void;
}

export default function CreateProposalDialog({
  lead,
  allLeads = [],
  onClose,
  onSave,
  onApproveAndSend,
}: CreateProposalDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  const [selectedLeadId, setSelectedLeadId] = useState<string>(lead?.id || (allLeads[0]?.id ?? ''));
  const activeLead = lead || allLeads.find((l) => l.id === selectedLeadId) || null;

  // Sizing and financial inputs
  const [panelCount, setPanelCount] = useState<number>(24);
  const [panelWatts] = useState<number>(400);
  const [ppaRateCents, setPpaRateCents] = useState<number>(14.5);
  const [ppaEscalatorPct, setPpaEscalatorPct] = useState<number>(2.9);
  const [includeBattery, setIncludeBattery] = useState<boolean>(true);
  const [utilityRateCents, setUtilityRateCents] = useState<number>(18.2);
  const [annualConsumptionKwh] = useState<number>(13800);

  // View mode: 'overview' (interactive cards) or 'document' (live printable proposal document)
  const [viewMode, setViewMode] = useState<'overview' | 'document'>('overview');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => lockPageScroll(), []);
  useEffect(() => { dialogRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submitting, onClose]);

  const customerName = activeLead?.name || 'Valued Homeowner';
  const customerAddress = activeLead?.address || 'Houston, TX';

  const proposal = useMemo<BuiltProposal>(() => {
    const params: ProposalInputParams = {
      leadId: activeLead?.id,
      customerName,
      address: customerAddress,
      email: activeLead?.email || undefined,
      phone: activeLead?.phone || undefined,
      panelCount,
      panelWatts,
      annualConsumptionKwh,
      ppaRateCents,
      ppaEscalatorPct,
      utilityRateCents,
      includeBattery,
      batteryName: 'Tesla Powerwall 3',
    };
    return buildProposal(params);
  }, [
    activeLead,
    customerName,
    customerAddress,
    panelCount,
    panelWatts,
    annualConsumptionKwh,
    ppaRateCents,
    ppaEscalatorPct,
    utilityRateCents,
    includeBattery,
  ]);

  const handleCopyLink = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://thepowergenie.theroyeffect.com';
    const fakeToken = `prop_${activeLead?.id || 'demo'}_${Date.now()}`;
    const url = `${origin}/proposal/${fakeToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      setToast('Customer proposal link copied to clipboard.');
    } catch {
      window.prompt('Copy customer proposal link:', url);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(proposal.html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 350);
    }
  };

  const handleSave = () => {
    if (activeLead && onSave) {
      onSave(activeLead.id, proposal);
    }
    setToast('Proposal saved to customer record.');
    setTimeout(() => {
      onClose();
    }, 900);
  };

  const handleApproveAndSend = async () => {
    setSubmitting(true);
    if (activeLead && onApproveAndSend) {
      onApproveAndSend(activeLead.id, proposal);
    }
    await new Promise((res) => setTimeout(res, 600));
    setSubmitting(false);
    setToast(`Proposal approved and sent to ${customerName}.`);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[96] flex items-stretch justify-center bg-hub-scrim p-0 sm:items-center sm:p-4"
      onClick={() => { if (!submitting) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-hub-surface shadow-2xl outline-none sm:h-[92vh] sm:rounded-3xl"
      >
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hub-line bg-hub-surface px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-hub-primary/10 text-hub-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 id={titleId} className="m-0 text-lg font-bold tracking-tight text-hub-ink">
                Create Solar Proposal {activeLead ? `· ${activeLead.name}` : ''}
              </h2>
              <p className="m-0 text-xs text-hub-soft">
                Zero-down Sunrun solar agreement & Tesla Powerwall 3 proposal generator
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-hub-line bg-hub-muted p-1">
              <button
                type="button"
                onClick={() => setViewMode('overview')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition',
                  viewMode === 'overview'
                    ? 'bg-hub-surface text-hub-ink shadow-sm'
                    : 'text-hub-soft hover:text-hub-ink',
                )}
              >
                <Sliders className="h-3.5 w-3.5" /> Spec Builder
              </button>
              <button
                type="button"
                onClick={() => setViewMode('document')}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition',
                  viewMode === 'document'
                    ? 'bg-hub-surface text-hub-ink shadow-sm'
                    : 'text-hub-soft hover:text-hub-ink',
                )}
              >
                <Eye className="h-3.5 w-3.5" /> Full Proposal Preview
              </button>
            </div>

            <button
              type="button"
              aria-label="Close dialog"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-hub-soft hover:bg-hub-muted hover:text-hub-ink"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Toast alert banner */}
        {toast && (
          <div className="bg-hub-success/15 px-5 py-2 text-center text-xs font-bold text-hub-success-ink">
            {toast}
          </div>
        )}

        {/* Content Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {viewMode === 'document' ? (
            /* Document Preview Frame */
            <div className="flex h-full w-full flex-col bg-slate-100">
              <div className="flex items-center justify-between border-b border-hub-line bg-white px-4 py-2 text-xs text-hub-soft">
                <span className="font-semibold text-hub-ink">Interactive Customer Proposal View</span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-[32px] px-2.5 text-xs font-semibold"
                    onClick={handlePrint}
                  >
                    <Printer className="h-3.5 w-3.5" /> Print / PDF
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-[32px] px-2.5 text-xs font-semibold"
                    onClick={handleCopyLink}
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-hub-success" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Share link'}
                  </Button>
                </div>
              </div>
              <iframe
                title="Customer Proposal Document"
                srcDoc={proposal.html}
                sandbox={HTML_PREVIEW_SANDBOX}
                className="h-full w-full flex-1 border-0 bg-white"
              />
            </div>
          ) : (
            /* Spec Builder & Controls View */
            <div className="grid gap-6 p-5 lg:grid-cols-12">
              {/* Left Column: Form Controls (5 cols) */}
              <div className="space-y-5 lg:col-span-5">
                {!lead && allLeads.length > 0 && (
                  <div className="rounded-2xl border border-hub-line bg-hub-surface p-4">
                    <label className={labelClass} htmlFor="prop-customer-select">
                      Select Customer Lead
                    </label>
                    <select
                      id="prop-customer-select"
                      className={inputClass}
                      value={selectedLeadId}
                      onChange={(e) => setSelectedLeadId(e.target.value)}
                    >
                      {allLeads.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} — {l.address || 'Houston, TX'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Sizing Controls */}
                <div className="rounded-2xl border border-hub-line bg-hub-surface p-4">
                  <div className="flex items-center justify-between">
                    <label className={labelClass} htmlFor="panel-slider">
                      Module Count & DC Capacity
                    </label>
                    <span className="text-sm font-bold text-hub-ink">
                      {panelCount} panels ({proposal.system.kw} kW)
                    </span>
                  </div>
                  <input
                    id="panel-slider"
                    type="range"
                    min={12}
                    max={44}
                    step={2}
                    value={panelCount}
                    onChange={(e) => setPanelCount(Number(e.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-hub-line accent-hub-accent-fill"
                  />
                  <div className="mt-2 flex justify-between text-[0.75rem] text-hub-soft">
                    <span>12 modules (4.8 kW)</span>
                    <span className="font-semibold text-hub-accent-ink">{proposal.system.offsetPct}% Consumption Offset</span>
                    <span>44 modules (17.6 kW)</span>
                  </div>
                </div>

                {/* Pricing & Plan Controls */}
                <div className="rounded-2xl border border-hub-line bg-hub-surface p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-hub-soft">
                    Solar Financial Plan
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass} htmlFor="ppa-rate-input">
                        PPA Plan Rate (¢/kWh)
                      </label>
                      <input
                        id="ppa-rate-input"
                        type="number"
                        step={0.1}
                        min={5}
                        max={30}
                        value={ppaRateCents}
                        onChange={(e) => setPpaRateCents(Number(e.target.value))}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="utility-rate-input">
                        Current Utility Rate (¢/kWh)
                      </label>
                      <input
                        id="utility-rate-input"
                        type="number"
                        step={0.1}
                        min={5}
                        max={40}
                        value={utilityRateCents}
                        onChange={(e) => setUtilityRateCents(Number(e.target.value))}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className={labelClass}>Annual Escalator</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: '0.0% Fixed', value: 0.0 },
                        { label: '2.9% Standard', value: 2.9 },
                        { label: '3.5% Option', value: 3.5 },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => setPpaEscalatorPct(item.value)}
                          className={cn(
                            'rounded-xl border py-2 text-xs font-bold transition',
                            ppaEscalatorPct === item.value
                              ? 'border-hub-primary bg-hub-primary/10 text-hub-primary'
                              : 'border-hub-line bg-hub-surface text-hub-soft hover:border-hub-ink',
                          )}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Battery Storage Toggle */}
                  <div className="mt-4 flex items-center justify-between border-t border-hub-line pt-3">
                    <div className="flex items-center gap-2">
                      <BatteryCharging className="h-4 w-4 text-hub-accent-ink" />
                      <div>
                        <span className="block text-xs font-bold text-hub-ink">Tesla Powerwall 3</span>
                        <span className="block text-[0.72rem] text-hub-soft">13.5 kWh LFP Storm Backup</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={includeBattery}
                      onClick={() => setIncludeBattery(!includeBattery)}
                      className={cn(
                        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                        includeBattery ? 'bg-hub-accent-fill' : 'bg-hub-line',
                      )}
                    >
                      <span
                        className={cn(
                          'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                          includeBattery ? 'translate-x-5' : 'translate-x-0',
                        )}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Proposal Summary & Visual Breakdown (7 cols) */}
              <div className="space-y-4 lg:col-span-7">
                {/* Executive Savings Callout */}
                <div className="rounded-2xl border border-hub-line bg-[#0B2233] p-5 text-white shadow-md">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-widest text-[#FF8A2B]">
                        Zero-Down Sunrun Solar
                      </span>
                      <h3 className="m-0 text-xl font-bold">{customerName}</h3>
                      <p className="m-0 text-xs text-white/70">{customerAddress}</p>
                    </div>
                    <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-[#FF8A2B]">
                      {proposal.system.kw} kW DC · {panelCount} Panels
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-white/5 p-3">
                      <span className="block text-xs text-white/70">Bill Now</span>
                      <span className="text-lg font-extrabold text-white">
                        ${proposal.monthlyBillNow}/mo
                      </span>
                    </div>
                    <div className="rounded-xl bg-white/5 p-3">
                      <span className="block text-xs text-white/70">New Solar Plan</span>
                      <span className="text-lg font-extrabold text-[#FF8A2B]">
                        ${proposal.monthlySolarPlan}/mo
                      </span>
                    </div>
                    <div className="rounded-xl bg-white/5 p-3">
                      <span className="block text-xs text-white/70">Monthly Savings</span>
                      <span className="text-lg font-extrabold text-emerald-400">
                        +${proposal.monthlySavings}/mo
                      </span>
                    </div>
                    <div className="rounded-xl bg-white/5 p-3">
                      <span className="block text-xs text-white/70">25-Yr Savings</span>
                      <span className="text-lg font-extrabold text-emerald-300">
                        +${proposal.twentyFiveYearSavings.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 25-Year Cumulative Projection Table */}
                <div className="rounded-2xl border border-hub-line bg-hub-surface p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="m-0 text-xs font-bold uppercase tracking-wider text-hub-soft">
                      25-Year Financial Milestones
                    </h4>
                    <span className="text-xs text-hub-soft">Standard Sunrun Guarantee</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-hub-line text-hub-soft">
                          <th className="py-2">Milestone</th>
                          <th className="py-2">Solar Output</th>
                          <th className="py-2">Without Solar</th>
                          <th className="py-2">With Sunrun</th>
                          <th className="py-2 text-right">Cumulative Net Savings</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hub-line">
                        {proposal.schedule
                          .filter((r) => r.year === 1 || r.year === 5 || r.year === 10 || r.year === 15 || r.year === 25)
                          .map((row) => (
                            <tr key={row.year} className="hover:bg-hub-muted/50">
                              <td className="py-2.5 font-bold text-hub-ink">Year {row.year}</td>
                              <td className="py-2.5 text-hub-soft">{row.productionKwh.toLocaleString()} kWh</td>
                              <td className="py-2.5 text-hub-soft">${row.billWithout.toLocaleString()}</td>
                              <td className="py-2.5 text-hub-soft">${(row.billWith + row.planCost).toLocaleString()}</td>
                              <td className="py-2.5 text-right font-bold text-hub-success-ink">
                                +${row.cumulative.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Guarantee and Certification Badges */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex items-start gap-3 rounded-2xl border border-hub-line bg-hub-surface p-3.5">
                    <Sun className="h-5 w-5 text-hub-accent-ink" />
                    <div>
                      <p className="m-0 text-xs font-bold text-hub-ink">Sunrun Production Guarantee</p>
                      <p className="m-0 text-[0.75rem] text-hub-soft">
                        Guarantees expected annual kWh generation or credits difference directly.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-2xl border border-hub-line bg-hub-surface p-3.5">
                    <Zap className="h-5 w-5 text-hub-primary" />
                    <div>
                      <p className="m-0 text-xs font-bold text-hub-ink">Full Roof & Equipment Warranty</p>
                      <p className="m-0 text-[0.75rem] text-hub-soft">
                        25-year comprehensive coverage on roof penetrations, inverters, and hardware.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Actions Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hub-line bg-hub-surface px-5 py-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              className="min-h-10 px-3 text-xs font-semibold"
              onClick={handleCopyLink}
            >
              {copied ? <Check className="h-3.5 w-3.5 text-hub-success" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-10 px-3 text-xs font-semibold"
              onClick={handlePrint}
            >
              <Printer className="h-3.5 w-3.5" /> Print / PDF
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              className="min-h-10 px-4 text-xs font-semibold"
              onClick={handleSave}
              disabled={submitting}
            >
              Save to customer
            </Button>
            <Button
              type="button"
              variant="accent"
              className="min-h-10 px-5 text-xs font-bold"
              onClick={() => void handleApproveAndSend()}
              disabled={submitting}
            >
              <Send className="h-3.5 w-3.5" /> Approve & send proposal
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
