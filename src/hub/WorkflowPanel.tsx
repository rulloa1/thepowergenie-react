import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import type { LeadOverrides } from '../../shared/workflow';
import { lockPageScroll } from '../lib/scrollLock';
import { HTML_PREVIEW_SANDBOX } from './htmlDocument';
import { stageLabel } from './leadRecord';
import { formatDateTime } from './time';
import { Button, Notice, Spinner, cn, inputClass, labelClass } from './ui';
import {
  WORKFLOW_CHANGED,
  announceWorkflowChange,
  dueLabel,
  money,
  workflowApi,
  type LeadWorkflow,
  type WorkflowProposal,
} from './workflowApi';

const PIPELINE = ['bill_received', 'savings_calc', 'panel_design', 'proposal_ready', 'presented', 'signed', 'site_survey', 'permits', 'installed'];

const DESIGN_TEXT: Record<string, string> = {
  ok: 'Laid out on the real roof',
  no_key: 'Sized from usage (roof layout needs a Google key)',
  not_found: 'Sized from usage (no roof imagery for this address)',
  no_address: 'Sized from usage (needs a full street address)',
  error: 'Sized from usage (roof lookup will retry)',
  pending: 'Waiting for usage',
};

function proposalBadge(proposal: WorkflowProposal): { text: string; tone: string } {
  if (proposal.interestedAt) return { text: 'Customer is interested', tone: 'bg-hub-success text-hub-success-ink' };
  if (proposal.status === 'sent') return { text: proposal.viewCount ? `Viewed ${proposal.viewCount}×` : 'Sent, not opened yet', tone: 'bg-hub-info text-hub-info-ink' };
  if (proposal.status === 'approved') return { text: 'Approved, not sent', tone: 'bg-hub-warn text-hub-warn-ink' };
  if (proposal.status === 'draft') return { text: 'Draft, needs approval', tone: 'bg-hub-accent-soft text-hub-accent-ink' };
  return { text: 'Replaced', tone: 'bg-hub-muted text-hub-soft' };
}

function PreviewDialog({ html, title, canApprove, busy, onApprove, onClose }: {
  html: string;
  title: string;
  canApprove: boolean;
  busy: boolean;
  onApprove: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => lockPageScroll(), []);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-stretch justify-center bg-hub-scrim p-0 sm:items-center sm:p-4" onClick={() => { if (!busy) onClose(); }}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-4xl flex-col overflow-hidden bg-hub-surface shadow-2xl outline-none sm:h-[90vh] sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-hub-line px-4 py-3">
          <h2 id={titleId} className="m-0 truncate text-base font-bold text-hub-ink">{title}</h2>
          <button type="button" aria-label="Close preview" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-hub-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <iframe title={title} srcDoc={html} sandbox={HTML_PREVIEW_SANDBOX} className="min-h-0 w-full flex-1 border-0 bg-white" />
        {canApprove && (
          <div className="flex flex-col gap-2 border-t border-hub-line px-4 py-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Keep as draft</Button>
            <Button type="button" variant="accent" onClick={onApprove} disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : <><Send className="h-4 w-4" /> Approve and send</>}
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function AdjustForm({ data, busy, onSave, onCancel }: {
  data: LeadWorkflow;
  busy: boolean;
  onSave: (overrides: LeadOverrides) => void;
  onCancel: () => void;
}) {
  const base = useId();
  const current = data.workflow?.overrides || {};
  const [draft, setDraft] = useState<Record<string, string>>({
    ppaRateCents: current.ppaRateCents?.toString() ?? '',
    ppaEscalatorPct: current.ppaEscalatorPct?.toString() ?? '',
    targetOffsetPct: current.targetOffsetPct?.toString() ?? '',
    panelCount: current.panelCount?.toString() ?? '',
    annualKwh: current.annualKwh?.toString() ?? '',
  });
  const [battery, setBattery] = useState<'default' | 'yes' | 'no'>(current.includeBattery == null ? 'default' : current.includeBattery ? 'yes' : 'no');
  const field = (key: string, label: string, hint: string) => (
    <div>
      <label htmlFor={`${base}-${key}`} className={labelClass}>{label}</label>
      <input
        id={`${base}-${key}`}
        className={inputClass}
        type="number"
        inputMode="decimal"
        step="any"
        placeholder="Default"
        value={draft[key]}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
      />
      <p className="m-0 mt-1 text-[0.76rem] text-hub-soft">{hint}</p>
    </div>
  );
  const toNumber = (value: string) => (value.trim() === '' ? null : Number(value));
  return (
    <div className="mt-3 rounded-2xl border border-hub-line bg-hub-muted p-3.5">
      <p className="m-0 text-[0.9rem] font-bold text-hub-ink">Adjust this lead's proposal</p>
      <p className="m-0 mt-0.5 text-[0.8rem] text-hub-soft">Leave a box empty to use the default from Pricing.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {field('ppaRateCents', 'Rate (¢ per kWh)', 'Year-one plan price.')}
        {field('ppaEscalatorPct', 'Yearly increase (%)', '0 for a fixed rate.')}
        {field('panelCount', 'Number of panels', 'Overrides the automatic size.')}
        {field('targetOffsetPct', 'Target share of usage (%)', 'Usually 100.')}
        {field('annualKwh', 'Yearly usage (kWh)', 'Overrides the bill estimate.')}
        <div>
          <label htmlFor={`${base}-bat`} className={labelClass}>Battery</label>
          <select id={`${base}-bat`} className={inputClass} value={battery} onChange={(event) => setBattery(event.target.value as typeof battery)}>
            <option value="default">Default from Pricing</option>
            <option value="yes">Include a battery</option>
            <option value="no">No battery</option>
          </select>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button
          type="button"
          variant="primary"
          disabled={busy}
          onClick={() => onSave({
            ppaRateCents: toNumber(draft.ppaRateCents),
            ppaEscalatorPct: toNumber(draft.ppaEscalatorPct),
            panelCount: toNumber(draft.panelCount),
            targetOffsetPct: toNumber(draft.targetOffsetPct),
            annualKwh: toNumber(draft.annualKwh),
            includeBattery: battery === 'default' ? null : battery === 'yes',
          })}
        >
          {busy ? <Spinner className="h-4 w-4" /> : 'Save and rebuild'}
        </Button>
      </div>
    </div>
  );
}

export default function WorkflowPanel({ leadId, leadName, autoOpen, onOpenPricing }: {
  leadId: string;
  leadName: string;
  autoOpen: boolean;
  onOpenPricing: () => void;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [data, setData] = useState<LeadWorkflow | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [preview, setPreview] = useState<{ proposal: WorkflowProposal; html: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);

  const load = useCallback(async () => {
    if (leadId.startsWith('demo-')) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setData(await workflowApi.lead(leadId));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load the workflow.');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (!open || leadId.startsWith('demo-')) return;
    void load();
    const onChange = (event: Event) => {
      const changed = (event as CustomEvent<{ leadId?: string }>).detail?.leadId;
      if (!changed || changed === leadId) void load();
    };
    window.addEventListener(WORKFLOW_CHANGED, onChange);
    return () => window.removeEventListener(WORKFLOW_CHANGED, onChange);
  }, [open, load, leadId]);

  const act = async (key: string, work: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      const result = await work();
      if (result && typeof result === 'object' && 'stage' in (result as LeadWorkflow)) setData(result as LeadWorkflow);
      else await load();
      if (done) setNote(done);
      announceWorkflowChange(leadId);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That did not work. Please try again.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const approve = async (proposal: WorkflowProposal) => {
    setBusy(`approve:${proposal.id}`);
    setError(null);
    setNote(null);
    try {
      const result = await workflowApi.approve(proposal.id, true);
      setPreview(null);
      setNote(result.status === 'sent'
        ? `Approved and sent by ${result.channels.join(' and ')}.`
        : `Approved. ${result.note || 'Copy the link to share it.'}`);
      await load();
      announceWorkflowChange(leadId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not approve it.');
    } finally {
      setBusy(null);
    }
  };

  const openPreview = async (proposal: WorkflowProposal) => {
    setBusy(`preview:${proposal.id}`);
    setError(null);
    try {
      const result = await workflowApi.preview(proposal.id);
      setPreview({ proposal, html: result.html });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open the preview.');
    } finally {
      setBusy(null);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  const sample = leadId.startsWith('demo-');
  const wf = data?.workflow;
  const stageAt = PIPELINE.indexOf(data?.stage || 'bill_received');
  const active = data?.proposals.filter((proposal) => proposal.status !== 'superseded') || [];
  const openTasks = data?.tasks.filter((task) => !task.done_at && !task.cancelled_at) || [];
  const messages = data?.followups.filter((row) => row.status !== 'cancelled') || [];

  if (sample) {
    return (
      <div className="mt-3 rounded-2xl border border-hub-line bg-hub-muted p-3.5">
        <p className="m-0 text-[0.95rem] font-bold text-hub-ink">Numbers and panel layout</p>
        <p className="m-0 mt-1 text-[0.88rem] leading-relaxed text-hub-soft">
          On the signed-in desk, Horace rebuilds the savings and the roof layout from the bill Rory logged. This sample does not call that service.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-hub-line bg-hub-surface">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-2xl px-3.5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hub-focus"
      >
        <span className="flex items-center gap-2 text-[0.95rem] font-bold text-hub-ink">
          <Sparkles className="h-4 w-4 text-hub-accent-ink" aria-hidden="true" /> Sales workflow
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-hub-soft" /> : <ChevronDown className="h-4 w-4 text-hub-soft" />}
      </button>
      {open && (
        <div className="border-t border-hub-line px-3.5 pb-4 pt-3">
          {loading && !data && <div className="py-6 text-center text-hub-soft"><Spinner /></div>}
          {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}
          {note && <div className="mb-3"><Notice tone="success">{note}</Notice></div>}
          {data && (
            <>
              <ol className="m-0 flex list-none gap-1 overflow-x-auto p-0 pb-1" aria-label="Sale progress">
                {PIPELINE.map((stage, index) => (
                  <li
                    key={stage}
                    aria-current={index === stageAt ? 'step' : undefined}
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-[0.72rem] font-semibold',
                      data.stage === 'lost' ? 'bg-hub-muted text-hub-soft'
                        : index < stageAt ? 'bg-hub-success text-hub-success-ink'
                          : index === stageAt ? 'bg-hub-primary text-hub-on-primary'
                            : 'bg-hub-muted text-hub-soft',
                    )}
                  >
                    {index < stageAt && <Check className="mr-0.5 inline h-3 w-3" aria-hidden="true" />}
                    {stageLabel(stage)}
                  </li>
                ))}
              </ol>
              {data.stage === 'lost' && <p className="m-0 mt-2 text-[0.85rem] font-semibold text-hub-soft">Marked lost. Tasks and messages are stopped.</p>}

              {!data.rateReady && (
                <div className="mt-3">
                  <Notice tone="warn" title="Proposals wait for your Sunrun rate">
                    <Button type="button" variant="ghost" className="mt-1 min-h-[36px] px-3 text-[0.84rem]" onClick={onOpenPricing}>Set pricing</Button>
                  </Notice>
                </div>
              )}
              {wf?.optedOut && <div className="mt-3"><Notice tone="info">This customer opted out of emails and texts. Nothing automatic goes to them.</Notice></div>}

              <dl className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div className="rounded-xl border border-hub-line p-3">
                  <dt className="text-[0.72rem] font-semibold uppercase tracking-wide text-hub-soft">Yearly usage</dt>
                  <dd className="m-0 mt-1 text-[1.05rem] font-bold text-hub-ink">{wf?.usage ? `${wf.usage.annualKwh.toLocaleString('en-US')} kWh` : 'Waiting for a bill'}</dd>
                  {wf?.usage && <dd className="m-0 text-[0.76rem] text-hub-soft">{wf.usage.label}{!wf.usage.confident && ' · rough'}</dd>}
                </div>
                <div className="rounded-xl border border-hub-line p-3">
                  <dt className="text-[0.72rem] font-semibold uppercase tracking-wide text-hub-soft">System</dt>
                  <dd className="m-0 mt-1 text-[1.05rem] font-bold text-hub-ink">{wf?.system ? `${wf.system.panels} panels · ${wf.system.kw} kW` : '—'}</dd>
                  {wf?.system && <dd className="m-0 text-[0.76rem] text-hub-soft">Covers {wf.system.offsetPct}% · {DESIGN_TEXT[wf.designStatus] || ''}</dd>}
                </div>
                <div className="rounded-xl border border-hub-line p-3">
                  <dt className="text-[0.72rem] font-semibold uppercase tracking-wide text-hub-soft">Savings, year 1</dt>
                  <dd className="m-0 mt-1 text-[1.05rem] font-bold text-hub-ink">{wf?.savings?.ready ? `${money(wf.savings.savingsMonthly)}/mo` : '—'}</dd>
                  {wf?.savings?.ready && (
                    <dd className="m-0 text-[0.76rem] text-hub-soft">
                      Bill {money(wf.savings.billNowMonthly)} → {money(wf.savings.billWithSolarMonthly)} + plan {money(wf.savings.planMonthly)}
                    </dd>
                  )}
                </div>
              </dl>
              {wf?.designNote && wf.designStatus !== 'ok' && wf.designStatus !== 'no_key' && (
                <p className="m-0 mt-2 text-[0.8rem] text-hub-soft">Roof: {wf.designNote}</p>
              )}

              <div className="mt-4">
                <p className="m-0 mb-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-hub-soft">Proposal</p>
                {active.length === 0 ? (
                  <p className="m-0 text-[0.88rem] text-hub-soft">
                    {!wf?.usage ? 'Builds itself once a bill or usage is in.' : !data.rateReady ? 'Builds itself once the rate is set.' : 'Building. Tap Rebuild if it does not appear.'}
                  </p>
                ) : (
                  <ul className="m-0 grid list-none gap-2 p-0">
                    {active.map((proposal) => {
                      const badge = proposalBadge(proposal);
                      return (
                        <li key={proposal.id} className="rounded-xl border border-hub-line p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={cn('rounded-full px-2 py-0.5 text-[0.74rem] font-bold', badge.tone)}>{badge.text}</span>
                            <span className="text-[0.76rem] text-hub-soft">{formatDateTime(proposal.sentAt || proposal.approvedAt || proposal.updatedAt)}</span>
                          </div>
                          <p className="m-0 mt-2 text-[0.88rem] text-hub-ink">
                            {proposal.summary.panels} panels · {proposal.summary.kw} kW · saves {money(proposal.summary.savingsMonthly)}/mo · {money(proposal.summary.savingsTotal)} over the term
                            {proposal.summary.preliminary && <span className="ml-1 text-hub-warn-ink">(preliminary, no bill yet)</span>}
                          </p>
                          {proposal.sentChannels.length > 0 && <p className="m-0 mt-0.5 text-[0.78rem] text-hub-soft">Sent by {proposal.sentChannels.join(', ')}</p>}
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            <Button type="button" variant="ghost" className="min-h-[38px] px-3 text-[0.84rem]" disabled={busy !== null} onClick={() => void openPreview(proposal)}>
                              {busy === `preview:${proposal.id}` ? <Spinner className="h-4 w-4" /> : <><Eye className="h-3.5 w-3.5" /> Preview</>}
                            </Button>
                            {proposal.status === 'draft' && (
                              <Button type="button" variant="accent" className="min-h-[38px] px-3 text-[0.84rem]" disabled={busy !== null} onClick={() => void approve(proposal)}>
                                {busy === `approve:${proposal.id}` ? <Spinner className="h-4 w-4" /> : <><Send className="h-3.5 w-3.5" /> Approve and send</>}
                              </Button>
                            )}
                            {proposal.url && (
                              <Button type="button" variant="ghost" className="min-h-[38px] px-3 text-[0.84rem]" onClick={() => void copy(proposal.url!)}>
                                {copied === proposal.url ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy link</>}
                              </Button>
                            )}
                            {proposal.status === 'approved' && (
                              <Button type="button" variant="ghost" className="min-h-[38px] px-3 text-[0.84rem]" disabled={busy !== null} onClick={() => void act(`shared:${proposal.id}`, () => workflowApi.shared(proposal.id), 'Marked as shared.')}>
                                I shared the link
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" className="min-h-[38px] px-3 text-[0.84rem]" disabled={busy !== null} onClick={() => setAdjusting(!adjusting)}>
                    <SlidersHorizontal className="h-3.5 w-3.5" /> Adjust numbers
                  </Button>
                  <Button type="button" variant="ghost" className="min-h-[38px] px-3 text-[0.84rem]" disabled={busy !== null} onClick={() => void act('run', () => workflowApi.run(leadId), 'Rebuilt with the latest lead details.')}>
                    {busy === 'run' ? <Spinner className="h-4 w-4" /> : <><RefreshCw className="h-3.5 w-3.5" /> Rebuild</>}
                  </Button>
                </div>
                {adjusting && (
                  <AdjustForm
                    data={data}
                    busy={busy === 'adjust'}
                    onCancel={() => setAdjusting(false)}
                    onSave={(overrides) => void act('adjust', () => workflowApi.overrides(leadId, overrides), 'Saved. The draft was rebuilt with your numbers.').then((ok) => { if (ok) setAdjusting(false); })}
                  />
                )}
              </div>

              <div className="mt-4">
                <p className="m-0 mb-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-hub-soft">Tasks</p>
                {openTasks.length === 0 ? (
                  <p className="m-0 text-[0.88rem] text-hub-soft">No open tasks for this lead.</p>
                ) : (
                  <ul className="m-0 grid list-none gap-1.5 p-0">
                    {openTasks.map((task) => {
                      const due = dueLabel(task.due_at);
                      return (
                        <li key={task.id} className="flex items-start gap-2.5">
                          <button
                            type="button"
                            aria-label={`Mark done: ${task.title}`}
                            disabled={busy !== null}
                            onClick={() => void act(`task:${task.id}`, () => workflowApi.task(task.id, true))}
                            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hub-control text-hub-soft hover:border-hub-success-line hover:text-hub-success-ink disabled:opacity-50"
                          >
                            {busy === `task:${task.id}` ? <Spinner className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-4 w-4" />}
                          </button>
                          <div className="min-w-0">
                            <p className="m-0 text-[0.9rem] font-semibold text-hub-ink">{task.title}</p>
                            <p className="m-0 text-[0.78rem] text-hub-soft">
                              <span className={cn(due.overdue && 'font-semibold text-hub-danger')}>{due.text}</span>
                              {task.detail && <> · {task.detail}</>}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="mt-4">
                <p className="m-0 mb-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-hub-soft">
                  Customer messages {!data.smsConsent && <span className="normal-case tracking-normal">(email only, no text consent on file)</span>}
                </p>
                {messages.length === 0 ? (
                  <p className="m-0 text-[0.88rem] text-hub-soft">None yet. Messages are planned as the lead moves through the sale.</p>
                ) : (
                  <ul className="m-0 grid list-none gap-1.5 p-0">
                    {messages.map((row) => (
                      <li key={row.id} className="flex items-start gap-2.5 text-[0.86rem]">
                        {row.channel === 'email' ? <Mail className="mt-0.5 h-4 w-4 shrink-0 text-hub-soft" /> : <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-hub-soft" />}
                        <div className="min-w-0 flex-1">
                          <p className="m-0 truncate font-semibold text-hub-ink">{row.subject || row.body}</p>
                          <p className="m-0 text-[0.76rem] text-hub-soft">
                            {row.status === 'scheduled' ? `Scheduled ${formatDateTime(row.send_at)}`
                              : row.status === 'sent' ? `Sent ${formatDateTime(row.sent_at || row.send_at)}`
                                : `${row.status === 'failed' ? 'Failed' : 'Skipped'}${row.note && row.note !== 'only_without_usage' ? `: ${row.note}` : ''}`}
                          </p>
                        </div>
                        {row.status === 'scheduled' && (
                          <button
                            type="button"
                            className="shrink-0 text-[0.78rem] font-semibold text-hub-link hover:underline"
                            disabled={busy !== null}
                            onClick={() => void act(`cancel:${row.id}`, () => workflowApi.cancelFollowup(row.id))}
                          >
                            Cancel
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {preview && (
        <PreviewDialog
          html={preview.html}
          title={`Proposal for ${leadName}`}
          canApprove={preview.proposal.status === 'draft'}
          busy={busy === `approve:${preview.proposal.id}`}
          onApprove={() => void approve(preview.proposal)}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
