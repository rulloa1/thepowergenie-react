import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Settings2,
  Share2,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { HTML_PREVIEW_SANDBOX, isHtmlObjectPath, openHtmlBlob, readSignedHtml } from './htmlDocument';
import {
  canPreviewObject,
  customerObjectPath,
  fillWorkflowTemplate,
  optionBObjectPath,
  parseOptionBWorkflow,
  telHref,
  type OptionBWorkflow,
  type WorkflowDocument,
} from './optionB';
import type { Lead, LeadFeed } from './useLeadFeed';
import { leadsForView } from './useLeadFeed';
import ArchiveLeadDialog from './ArchiveLeadDialog';
import LeadForm from './LeadForm';
import PricingDialog from './PricingDialog';
import TasksStrip from './TasksStrip';
import WorkflowPanel from './WorkflowPanel';
import { PipelineBar, PipelineSummary } from './PipelineStage';
import { WORKFLOW_CHANGED, announceWorkflowChange, workflowApi } from './workflowApi';
import { archiveCustomerLead, createManualLead, restoreCustomerLead, updateManualLead } from './leadActions';
import { stageLabel, type LeadActor, type LeadDraft } from './leadRecord';
import { Button, Notice, Spinner, cn } from './ui';
import { formatDateTime } from './time';
import {
  downloadFile,
  generateTwoStepReviewEmail,
  generateTwoStepReviewEmailUrl,
  generateTwoStepReviewSmsText,
  generateTwoStepReviewSmsUrl,
  leadsToCsvString,
  leadsToJsonString,
} from './leadExports';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMoney(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatKwh(value: number | null): string {
  if (value == null) return '—';
  return `${Math.round(value).toLocaleString('en-US')} kWh`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${formatDateTime(iso)} CT`;
}

function monthLabel(month: string, withYear: boolean): string {
  const [year, raw] = month.split('-');
  const name = MONTHS[Number(raw) - 1] || month;
  return withYear ? `${name} ${year.slice(2)}` : name;
}

function UsageHistory({ points }: { points: Lead['usageHistory'] }) {
  if (!points?.length) return <p className="m-0 text-sm font-medium text-hub-soft">No usage history on the bill.</p>;
  const max = Math.max(...points.map((point) => point.kwh), 1);
  const years = new Set(points.map((point) => point.month.slice(0, 4)));
  const withYear = years.size > 1;
  const summary = points.map((point) => `${point.month} ${Math.round(point.kwh).toLocaleString('en-US')} kWh`).join(', ');
  return (
    <div className="rounded-xl border border-hub-line bg-hub-muted p-3">
      <div className="overflow-x-auto" role="img" aria-label={`Monthly usage: ${summary}`}>
        <div className="flex h-28 items-end gap-2" style={{ minWidth: Math.max(points.length * 38, 160) }}>
          {points.map((point) => (
            <div key={point.month} className="flex min-w-8 flex-1 flex-col items-center justify-end gap-1.5" title={`${point.month}: ${point.kwh} kWh`}>
              <span className="text-xs font-extrabold text-hub-ink">{Math.round(point.kwh)}</span>
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-hub-chart to-hub-chart-top"
                style={{ height: `${Math.max(10, (point.kwh / max) * 62)}px` }}
              />
              <span className="text-xs font-bold text-hub-soft">{monthLabel(point.month, withYear)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-hub-line bg-hub-muted p-3">
      <dt className="text-xs font-bold uppercase tracking-wider text-hub-soft">{label}</dt>
      <dd className="m-0 mt-1 break-words text-base font-extrabold text-hub-ink">{children}</dd>
    </div>
  );
}

const chipClass = 'inline-flex items-center gap-1.5 rounded-lg border border-hub-line bg-hub-muted px-3 py-1.5 text-xs font-bold text-hub-link no-underline hover:bg-hub-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hub-focus';

const SIGNED_URL_SECONDS = 120;

function useOptionBWorkflow(lead: Lead): OptionBWorkflow | null {
  const [workflow, setWorkflow] = useState<OptionBWorkflow | null>(null);

  useEffect(() => {
    if (lead.source !== 'customer' || !supabase) {
      setWorkflow(null);
      return;
    }
    const path = optionBObjectPath(lead.id);
    if (!path) {
      setWorkflow(null);
      return;
    }
    let cancelled = false;
    setWorkflow(null);
    void supabase.storage.from('powergenie').download(path).then(async ({ data, error }) => {
      if (cancelled || error || !data) return;
      const text = await data.text();
      if (cancelled) return;
      const parsed = parseOptionBWorkflow(text, lead.id);
      if (parsed) setWorkflow(parsed);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lead.id, lead.source]);

  return workflow;
}

function TwoStepOutreachBar({ lead }: { lead: Lead }) {
  const [copiedType, setCopiedType] = useState<'text' | 'email' | null>(null);

  const handleCopyText = (event: React.MouseEvent) => {
    event.stopPropagation();
    const text = generateTwoStepReviewSmsText(lead.name);
    navigator.clipboard.writeText(text).then(() => {
      setCopiedType('text');
      setTimeout(() => setCopiedType(null), 2500);
    });
  };

  const handleCopyEmail = (event: React.MouseEvent) => {
    event.stopPropagation();
    const { body } = generateTwoStepReviewEmail(lead.name);
    navigator.clipboard.writeText(body).then(() => {
      setCopiedType('email');
      setTimeout(() => setCopiedType(null), 2500);
    });
  };

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-hub-accent-line bg-hub-accent-soft p-2.5 text-[0.8rem]">
      <span className="text-[0.72rem] font-bold uppercase tracking-wider text-hub-accent-ink">
        2-Step Review Request:
      </span>
      {lead.phone && (
        <a
          href={generateTwoStepReviewSmsUrl(lead)}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-md bg-hub-accent-fill px-2.5 py-1 text-[0.74rem] font-bold text-hub-on-accent no-underline shadow-sm hover:bg-hub-accent-fill-hover"
          title="Open SMS app with 2-step review request"
        >
          <Phone className="h-3 w-3" /> Text 2 Steps
        </a>
      )}
      <button
        type="button"
        onClick={handleCopyText}
        className="inline-flex items-center gap-1 rounded-md border border-hub-control bg-hub-surface px-2 py-1 text-[0.74rem] font-medium text-hub-soft hover:bg-hub-muted"
        title="Copy SMS text to clipboard"
      >
        {copiedType === 'text' ? <Check className="h-3 w-3 text-hub-success-ink" /> : <Copy className="h-3 w-3" />}
        {copiedType === 'text' ? 'Copied Text!' : 'Copy Text'}
      </button>

      {lead.email && (
        <a
          href={generateTwoStepReviewEmailUrl(lead)}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-md border border-hub-on-primary bg-hub-primary px-2.5 py-1 text-[0.74rem] font-bold text-hub-on-primary no-underline shadow-sm hover:bg-hub-primary-hover"
          title="Open email client with 2-step review request"
        >
          <Mail className="h-3 w-3" /> Email 2 Steps
        </a>
      )}
      <button
        type="button"
        onClick={handleCopyEmail}
        className="inline-flex items-center gap-1 rounded-md border border-hub-control bg-hub-surface px-2 py-1 text-[0.74rem] font-medium text-hub-soft hover:bg-hub-muted"
        title="Copy email body to clipboard"
      >
        {copiedType === 'email' ? <Check className="h-3 w-3 text-hub-success-ink" /> : <Copy className="h-3 w-3" />}
        {copiedType === 'email' ? 'Copied Email!' : 'Copy Email'}
      </button>
    </div>
  );
}

function SunrunOptionBWorkflow({ lead }: { lead: Lead }) {
  const workflow = useOptionBWorkflow(lead);
  const [open, setOpen] = useState(true);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [htmlView, setHtmlView] = useState<{ label: string; html: string } | null>(null);
  const [htmlBusy, setHtmlBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const storageKey = `pg_workflow_${lead.id}`;
  const [completed, setCompleted] = useState<Record<string, boolean>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '{}') as unknown;
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
      return stored as Record<string, boolean>;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (!htmlView) return;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHtmlView(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [htmlView]);

  if (!workflow) return null;

  const sign = async (objectPath: string): Promise<string | null> => {
    const path = customerObjectPath(lead.id, objectPath);
    if (!path || !supabase) return null;
    const { data, error } = await supabase.storage.from('powergenie').createSignedUrl(path, SIGNED_URL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  };

  const openFile = async (objectPath: string) => {
    setFileError(null);
    const path = customerObjectPath(lead.id, objectPath);
    const url = path ? await sign(path) : null;
    if (!path || !url) {
      setFileError("Couldn't open that file. Please try again.");
      return;
    }
    if (!isHtmlObjectPath(path)) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    setHtmlBusy(true);
    const html = await readSignedHtml(url);
    setHtmlBusy(false);
    if (!html) {
      setFileError("Couldn't open that file. Please try again.");
      return;
    }
    const label = workflow.documents.find((document) => document.path === path)?.label || 'Document';
    setHtmlView({ label, html });
  };

  const openHtml = (print: boolean) => {
    if (!htmlView) return;
    if (!openHtmlBlob(htmlView.html, print)) {
      setFileError('Allow pop-ups to open or print this document.');
    }
  };

  const togglePreview = async (document: WorkflowDocument) => {
    if (!document.preview || !canPreviewObject(document.path)) return;
    if (previewPath === document.path) {
      setPreviewPath(null);
      setPreviewUrl(null);
      return;
    }
    setFileError(null);
    const url = await sign(document.path);
    if (!url) {
      setFileError("Couldn't open that file. Please try again.");
      return;
    }
    setPreviewPath(document.path);
    setPreviewUrl(url);
  };

  const toggleStep = (id: string) => {
    setCompleted((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* progress is a convenience; the workflow still renders */
      }
      return next;
    });
  };

  const doneCount = workflow.steps.filter((step) => completed[step.id]).length;
  const pct = Math.round((doneCount / workflow.steps.length) * 100);
  const urgentTel = telHref(workflow.urgentPhone);
  const documentsById = new Map(workflow.documents.map((document) => [document.id, document]));

  return (
    <>
    <div className="mt-4 rounded-2xl border-2 border-hub-accent-ink bg-hub-accent-soft p-4 text-hub-ink sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hub-accent-line pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-hub-accent-fill text-hub-on-accent">
            <Zap className="h-4 w-4" />
          </span>
          <div>
            <h3 className="m-0 text-[1.05rem] font-bold text-hub-ink">{workflow.title}</h3>
            <p className="m-0 text-[0.78rem] text-hub-soft">{fillWorkflowTemplate(workflow.subtitle, lead)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex items-center gap-1 text-[0.8rem] font-semibold text-hub-accent-ink hover:underline"
        >
          {open ? <>Collapse <ChevronUp className="h-4 w-4" /></> : <>Expand <ChevronDown className="h-4 w-4" /></>}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {(workflow.urgentTitle || workflow.urgentBody) && (
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-hub-danger-line bg-hub-danger-soft p-3.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-hub-danger" />
                <div className="text-[0.85rem] leading-relaxed text-hub-danger-ink">
                  {workflow.urgentTitle && <strong className="font-bold">{workflow.urgentTitle}</strong>}
                  {workflow.urgentBody && <p className="m-0 mt-0.5">{fillWorkflowTemplate(workflow.urgentBody, lead)}</p>}
                  {workflow.showLeadNotes && lead.notes && <p className="m-0 mt-1">{lead.notes}</p>}
                  {workflow.showBalances && (
                    <p className="m-0 mt-1">
                      Past due: <strong>{formatMoney(lead.pastDue)}</strong>
                      {' · '}
                      Current charges: <strong>{formatMoney(lead.currentCharges)}</strong>
                      {' · '}
                      Total balance: <strong>{formatMoney(lead.amount)}</strong>
                    </p>
                  )}
                </div>
              </div>
              {urgentTel && workflow.urgentActionLabel && (
                <a
                  href={urgentTel}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-hub-danger-fill px-3.5 py-2 text-[0.82rem] font-bold text-white no-underline shadow hover:bg-hub-danger-fill-hover"
                >
                  <Phone className="h-3.5 w-3.5" /> {workflow.urgentActionLabel}
                </a>
              )}
            </div>
          )}

          {workflow.stats.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {workflow.stats.map((stat) => (
                <div key={stat.label} className="rounded-xl border border-hub-line bg-hub-surface p-3">
                  <span className="block text-[0.68rem] font-bold uppercase text-hub-soft">{stat.label}</span>
                  <strong className="text-[1.1rem] font-extrabold text-hub-ink">{fillWorkflowTemplate(stat.value, lead)}</strong>
                  <span className="block text-[0.72rem] text-hub-soft">{fillWorkflowTemplate(stat.detail, lead)}</span>
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between text-[0.76rem] font-semibold text-hub-soft">
              <span>Sunrun implementation progress</span>
              <span>{doneCount} of {workflow.steps.length} completed ({pct}%)</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-hub-line">
              <div className="h-full rounded-full bg-hub-accent-fill transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {workflow.documents.length > 0 && (
            <div className="rounded-xl border border-hub-line-strong bg-hub-surface p-3.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  {workflow.planTitle && <h4 className="m-0 text-[0.92rem] font-bold text-hub-ink">{workflow.planTitle}</h4>}
                  {workflow.planDescription && (
                    <p className="m-0 text-[0.78rem] text-hub-soft">{fillWorkflowTemplate(workflow.planDescription, lead)}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {workflow.documents.map((document) => (
                    <button
                      key={document.id}
                      type="button"
                      onClick={() => void openFile(document.path)}
                      className="inline-flex items-center gap-1 rounded-lg border border-hub-on-primary bg-hub-primary px-3 py-1.5 text-[0.78rem] font-bold text-hub-on-primary shadow hover:bg-hub-primary-hover"
                    >
                      {canPreviewObject(document.path) ? <Eye className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                      {document.label}
                    </button>
                  ))}
                </div>
              </div>
              {workflow.documents.some((document) => document.preview && canPreviewObject(document.path)) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {workflow.documents.filter((document) => document.preview && canPreviewObject(document.path)).map((document) => (
                    <button
                      key={`preview-${document.id}`}
                      type="button"
                      onClick={() => void togglePreview(document)}
                      className="rounded-lg border border-hub-line px-2.5 py-1.5 text-[0.78rem] font-semibold text-hub-accent-ink hover:bg-hub-accent-soft"
                    >
                      {previewPath === document.path ? `Hide ${document.label}` : `Show ${document.label}`}
                    </button>
                  ))}
                </div>
              )}
              {previewUrl && (
                <div className="mt-3 overflow-hidden rounded-lg border border-white/30 bg-hub-navy">
                  <img src={previewUrl} alt={workflow.planTitle || 'Customer plan'} className="w-full object-contain" />
                  <p className="m-0 bg-hub-navy p-2 text-center text-[0.72rem] text-hub-on-navy">
                    Signed link for this hub session. It expires shortly.
                  </p>
                </div>
              )}
            </div>
          )}

          {htmlBusy && <p className="m-0 text-[0.84rem] text-hub-soft">Opening document…</p>}
          {fileError && <Notice tone="error">{fileError}</Notice>}

          <div className="space-y-2">
            {workflow.steps.map((step) => {
              const isDone = !!completed[step.id];
              const document = step.documentId ? documentsById.get(step.documentId) : undefined;
              const stepTel = telHref(step.phone);
              return (
                <div
                  key={step.id}
                  onClick={() => toggleStep(step.id)}
                  className={cn(
                    'flex cursor-pointer items-start justify-between gap-3 rounded-xl border p-3 transition-colors',
                    isDone
                      ? 'border-hub-success-line bg-hub-success'
                      : step.urgent
                        ? 'border-hub-danger-line bg-hub-surface'
                        : 'border-hub-line bg-hub-surface hover:border-hub-line-strong',
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => toggleStep(step.id)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={step.title}
                      className="mt-1 h-4 w-4 rounded accent-hub-accent-ink focus:ring-hub-focus"
                    />
                    <div>
                      <h4 className={cn('m-0 text-[0.88rem] font-bold', isDone && 'text-hub-soft line-through')}>
                        {step.title}
                      </h4>
                      <p className="m-0 mt-0.5 text-[0.8rem] leading-snug text-hub-soft">
                        {fillWorkflowTemplate(step.description, lead)}
                      </p>
                    </div>
                  </div>
                  {!isDone && document && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void openFile(document.path);
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-hub-accent-ink px-2.5 py-1 text-[0.74rem] font-bold text-hub-accent-ink no-underline hover:bg-hub-accent-soft"
                    >
                      {step.actionLabel || document.label}
                    </button>
                  )}
                  {!isDone && !document && stepTel && step.actionLabel && (
                    <a
                      href={stepTel}
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-hub-accent-ink px-2.5 py-1 text-[0.74rem] font-bold text-hub-accent-ink no-underline hover:bg-hub-accent-soft"
                    >
                      {step.actionLabel}
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {(workflow.footer || workflow.advisor) && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hub-accent-line pt-3 text-[0.78rem] text-hub-soft">
              {workflow.footer && (
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-hub-success-ink" />
                  {workflow.footer}
                </span>
              )}
              {workflow.advisor && <span>{workflow.advisor}</span>}
            </div>
          )}
        </div>
      )}
    </div>
    {htmlView && createPortal(
      <div
        className="fixed inset-0 z-[80] flex items-stretch justify-center bg-hub-scrim p-2 sm:p-4"
        onClick={() => setHtmlView(null)}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="html-doc-title"
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
          className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-hub-surface shadow-2xl outline-none"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hub-line px-4 py-3">
            <h2 id="html-doc-title" className="m-0 text-base font-bold text-hub-ink">{htmlView.label}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" className="min-h-[36px] px-3 text-[0.84rem]" onClick={() => openHtml(true)}>
                <Printer className="h-4 w-4" /> Print / Save as PDF
              </Button>
              <Button type="button" variant="ghost" className="min-h-[36px] px-3 text-[0.84rem]" onClick={() => openHtml(false)}>
                Open in new tab
              </Button>
              <button
                type="button"
                onClick={() => setHtmlView(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-hub-line text-hub-ink hover:border-hub-ink"
                aria-label="Close document"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {fileError && <p className="m-0 border-b border-hub-error-line bg-hub-error px-4 py-2 text-[0.84rem] text-hub-error-ink" role="alert">{fileError}</p>}
          <iframe
            title={htmlView.label}
            sandbox={HTML_PREVIEW_SANDBOX}
            referrerPolicy="no-referrer"
            srcDoc={htmlView.html}
            className="min-h-0 w-full flex-1 border-0 bg-hub-surface"
          />
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}

export default function LeadsTab({
  feed,
  profile,
}: {
  feed: LeadFeed;
  profile: { id: string; email: string; full_name: string | null };
}) {
  const [openId, setOpenId] = useState(() => new URLSearchParams(window.location.search).get('id'));
  const [opening, setOpening] = useState<string | null>(null);
  const [billError, setBillError] = useState<string | null>(null);
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; lead: Lead | null } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Lead | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const marked = useRef(new Set<string>());
  const scrolled = useRef<string | null>(null);
  const actor: LeadActor = { id: profile.id, fullName: profile.full_name, email: profile.email };
  const inView = leadsForView(feed.leads, view);
  const customersInView = inView.filter((lead) => lead.source === 'customer');
  const shown = stageFilter
    ? customersInView.filter((lead) => (lead.stage || 'bill_received') === stageFilter)
    : inView;

  // Stages change from the workflow panel and the task list; refresh the cards.
  const { refresh } = feed;
  useEffect(() => {
    const onChange = () => refresh();
    window.addEventListener(WORKFLOW_CHANGED, onChange);
    return () => window.removeEventListener(WORKFLOW_CHANGED, onChange);
  }, [refresh]);
  const archivedCount = feed.leads.filter((lead) => lead.archived).length;

  useEffect(() => {
    const sync = () => setOpenId(new URLSearchParams(window.location.search).get('id'));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  useEffect(() => {
    if (!openId) return;
    if (feed.leads.some((lead) => lead.id === openId && lead.archived)) setView('archived');
  }, [openId, feed.leads]);

  useEffect(() => {
    if (!openId) return;
    const matches = feed.leads.filter((lead) => lead.id === openId);
    for (const lead of matches) {
      const key = `${lead.source}:${lead.id}`;
      if (marked.current.has(key)) continue;
      marked.current.add(key);
      void feed.markSeen(lead);
    }
    if (matches.length && scrolled.current !== openId) {
      scrolled.current = openId;
      document.querySelector(`[data-lead-id="${CSS.escape(openId)}"]`)?.scrollIntoView({ block: 'center' });
    }
  }, [openId, feed.leads, feed.markSeen]);

  const select = (lead: Lead) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'leads');
    url.searchParams.set('id', lead.id);
    window.history.replaceState({}, '', url);
    setOpenId(lead.id);
    marked.current.add(`${lead.source}:${lead.id}`);
    void feed.markSeen(lead);
  };

  const openLeadById = (leadId: string) => {
    const lead = feed.leads.find((item) => item.id === leadId && item.source === 'customer') || feed.leads.find((item) => item.id === leadId);
    if (!lead) return;
    if (lead.archived) setView('archived');
    setStageFilter(null);
    scrolled.current = null;
    select(lead);
  };

  const openBill = async (lead: Lead) => {
    if (!lead.bill || !supabase) return;
    setOpening(`${lead.source}:${lead.id}`);
    setBillError(null);
    const { data, error } = await supabase.storage.from(lead.bill.bucket).createSignedUrl(lead.bill.path, 60);
    setOpening(null);
    if (error || !data?.signedUrl) {
      setBillError("Couldn't open that bill. Please try again.");
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
    void select(lead);
  };

  const saveLead = async (draft: LeadDraft, file: File | null) => {
    if (!editor) return;
    setSaving(true);
    setFormError(null);
    const result = editor.mode === 'create' || !editor.lead
      ? await createManualLead(draft, actor, file)
      : await updateManualLead(editor.lead.id, draft, actor, file);
    setSaving(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setEditor(null);
    setActionNote(result.warning || (editor.mode === 'create' ? 'Lead added.' : 'Lead updated.'));
    if (editor.mode === 'create') setView('active');
    feed.refresh();
    const savedId = editor.mode === 'create' || !editor.lead ? result.id : editor.lead.id;
    if (savedId) {
      // Build the savings and proposal right away instead of waiting for the next automatic run.
      void workflowApi.run(savedId).then(() => announceWorkflowChange(savedId)).catch(() => undefined);
    }
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    setArchiveError(null);
    const result = await archiveCustomerLead(archiveTarget.id, actor);
    setArchiving(false);
    if (!result.ok) {
      setArchiveError(result.error);
      return;
    }
    setArchiveTarget(null);
    setActionNote('Lead archived. Restore it from Archived if you need it back.');
    feed.refresh();
  };

  const restore = async (lead: Lead) => {
    setActionNote(null);
    setBillError(null);
    const result = await restoreCustomerLead(lead.id, actor);
    if (!result.ok) {
      setBillError(result.error);
      return;
    }
    setActionNote('Lead restored to the active list.');
    setView('active');
    feed.refresh();
  };

  const missing = !feed.loading && !!openId && feed.leads.every((lead) => lead.id !== openId);

  return (
    <section aria-label="Leads" className="rounded-3xl bg-hub-surface p-4 shadow-[0_10px_30px_rgba(10,20,40,0.06)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-bold text-hub-ink">Leads</h2>
          <p className="m-0 text-[0.86rem] text-hub-soft">Website assistant, booking page, and leads you add, newest first</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {feed.writesEnabled && (
            <Button type="button" variant="accent" className="min-h-[40px] w-full px-3 sm:w-auto" onClick={() => { setFormError(null); setEditor({ mode: 'create', lead: null }); }}>
              <Plus className="h-4 w-4" /> Add lead
            </Button>
          )}
          <Button type="button" variant="ghost" className="min-h-[40px] px-3 text-[0.84rem]" onClick={() => setPricingOpen(true)}>
            <Settings2 className="h-4 w-4" /> Pricing
          </Button>
          {shown.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => downloadFile('powergenie-all-leads.csv', leadsToCsvString(shown), 'text/csv;charset=utf-8;')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-hub-line bg-hub-surface px-3 py-1.5 text-[0.78rem] font-semibold text-hub-ink shadow-sm hover:border-hub-line-strong hover:bg-hub-muted"
                title="Download all leads in CSV format"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-hub-success-ink" /> Export CSV
              </button>
              <button
                type="button"
                onClick={() => downloadFile('powergenie-all-leads.json', leadsToJsonString(shown), 'application/json')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-hub-line bg-hub-surface px-3 py-1.5 text-[0.78rem] font-semibold text-hub-ink shadow-sm hover:border-hub-line-strong hover:bg-hub-muted"
                title="Download all leads in JSON format"
              >
                <Download className="h-3.5 w-3.5 text-hub-accent-ink" /> Export JSON
              </button>
            </>
          )}
          <button
            onClick={feed.refresh}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-hub-line text-hub-ink hover:border-hub-ink hover:bg-hub-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hub-focus"
            aria-label="Refresh leads"
          >
            <RefreshCw className={cn('h-4 w-4', feed.loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      <TasksStrip sample={feed.sample} onOpenLead={openLeadById} onOpenPricing={() => setPricingOpen(true)} />

      <div className="mt-4 flex gap-2" role="tablist" aria-label="Lead lists">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'active'}
          onClick={() => setView('active')}
          className={cn(
            'min-h-[40px] flex-1 rounded-full px-3 text-[0.84rem] font-bold sm:flex-none',
            view === 'active' ? 'bg-hub-primary text-hub-on-primary' : 'border border-hub-line bg-hub-muted text-hub-soft',
          )}
        >
          Active
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'archived'}
          onClick={() => { setView('archived'); setStageFilter(null); }}
          className={cn(
            'min-h-[40px] flex-1 rounded-full px-3 text-[0.84rem] font-bold sm:flex-none',
            view === 'archived' ? 'bg-hub-primary text-hub-on-primary' : 'border border-hub-line bg-hub-muted text-hub-soft',
          )}
        >
          Archived{archivedCount > 0 ? ` (${archivedCount})` : ''}
        </button>
      </div>

      {view === 'active' && customersInView.length > 0 && (
        <PipelineSummary
          stages={customersInView.map((lead) => lead.stage)}
          total={inView.length}
          selected={stageFilter}
          onSelect={setStageFilter}
        />
      )}

      {feed.error && <div className="mt-4"><Notice tone="error">{feed.error}</Notice></div>}
      {feed.sample && (
        <div className="mt-4">
          <Notice tone="info" title="Sample desk">
            These Houston customers are examples. Sign in to log a real customer, attach a light bill, and share the same files and chat with Horace.
          </Notice>
        </div>
      )}
      {!feed.sample && !feed.loading && !feed.error && !feed.writesEnabled && (
        <div className="mt-4">
          <Notice tone="warn">Adding, editing, and archiving leads needs the latest database migration. You can still review the list.</Notice>
        </div>
      )}
      {actionNote && <div className="mt-4"><Notice tone="success">{actionNote}</Notice></div>}
      {billError && <div className="mt-4"><Notice tone="error">{billError}</Notice></div>}
      {missing && (
        <div className="mt-4">
          <Notice tone="warn">That lead isn't in the latest list. It may have been removed, or the link is off.</Notice>
        </div>
      )}

      {feed.loading && !shown.length ? (
        <div className="py-10 text-center text-hub-soft"><Spinner /></div>
      ) : shown.length === 0 && !feed.error ? (
        <p className="py-10 text-center text-hub-soft">
          {stageFilter
            ? `No leads at ${stageLabel(stageFilter)} right now.`
            : view === 'archived'
            ? 'No archived leads.'
            : 'No leads yet. Add one here, or wait for a website consult or a /book appointment.'}
        </p>
      ) : (
        <ul className="m-0 mt-4 grid list-none gap-3 p-0">
          {shown.map((lead) => {
            const selected = openId === lead.id;
            return (
              <li
                key={`${lead.source}:${lead.id}`}
                id={`lead-${lead.source}-${lead.id}`}
                data-lead-id={lead.id}
                className={cn(
                  'scroll-mt-24 rounded-2xl border px-4 py-3.5',
                  lead.cancelled ? 'border-hub-line bg-hub-muted opacity-70' : 'border-hub-line bg-hub-surface',
                  selected && 'ring-2 ring-hub-focus',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button type="button" onClick={() => select(lead)} className="min-w-0 flex-1 text-left">
                    <span className="flex flex-wrap items-center gap-2">
                      {lead.unseen && (
                        <span className="rounded-full border border-hub-on-accent bg-hub-accent-fill px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide text-hub-on-accent">New</span>
                      )}
                      <span className="rounded-full bg-hub-accent-soft px-2 py-0.5 text-[0.72rem] font-semibold text-hub-accent-ink">{lead.sourceLabel}</span>
                      {lead.archived && <span className="rounded-full bg-hub-muted px-2 py-0.5 text-[0.72rem] font-semibold text-hub-soft">Archived</span>}
                      {lead.cancelled && <span className="rounded-full bg-hub-muted px-2 py-0.5 text-[0.72rem] font-semibold text-hub-soft">Cancelled</span>}
                    </span>
                    <span className={cn('mt-1 block text-[1.05rem] font-bold text-hub-ink', lead.cancelled && 'line-through')}>{lead.name}</span>
                  </button>
                  <span className="text-[0.78rem] text-hub-soft">{formatWhen(lead.createdAt)}</span>
                </div>
                {lead.source === 'customer' && !lead.cancelled && <PipelineBar stage={lead.stage} />}

                <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
                  {lead.phone && (
                    <a
                      href={`tel:${lead.phone}`}
                      className={chipClass}
                    >
                      <Phone className="h-3.5 w-3.5 text-hub-soft" />{lead.phone}
                    </a>
                  )}
                  {lead.email && (
                    <a
                      href={`mailto:${lead.email}`}
                      className={chipClass}
                    >
                      <Mail className="h-3.5 w-3.5 text-hub-soft" />{lead.email}
                    </a>
                  )}
                  {lead.address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={chipClass}
                    >
                      <MapPin className="h-3.5 w-3.5 text-hub-soft" />{lead.address}
                    </a>
                  )}
                </div>

                <TwoStepOutreachBar lead={lead} />

                <dl className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Fact label="kWh">{formatKwh(lead.kwh)}</Fact>
                  <Fact label="Bill amount">{formatMoney(lead.amount)}</Fact>
                  <Fact label="Appointment">{formatWhen(lead.appointment)}</Fact>
                  <Fact label="Account #">{lead.accountNumber || '—'}</Fact>
                  <Fact label="ESI ID">{lead.esiid || '—'}</Fact>
                  <Fact label="Meter">{lead.meterNumber || '—'}</Fact>
                  <Fact label="Average monthly">{lead.avgMonthlyKwh == null ? '—' : formatKwh(lead.avgMonthlyKwh)}</Fact>
                </dl>
                {((lead.utility && lead.utility !== 'Not provided') || lead.tdu || lead.repPuctCertificate) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
                    {lead.utility && lead.utility !== 'Not provided' && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-hub-line bg-hub-muted px-2.5 py-1 text-hub-ink">
                        <Zap className="h-3 w-3 text-hub-accent-ink" /> {lead.utility}
                      </span>
                    )}
                    {lead.tdu && (
                      <span className="rounded-md border border-hub-line bg-hub-muted px-2.5 py-1 text-hub-link">
                        TDU: {lead.tdu}
                      </span>
                    )}
                    {lead.repPuctCertificate && (
                      <span className="rounded-md border border-hub-line bg-hub-muted px-2.5 py-1 text-hub-accent-ink">
                        PUCT #{lead.repPuctCertificate}
                      </span>
                    )}
                  </div>
                )}
                {lead.notes && (
                  <div className="mt-3 rounded-xl border border-hub-line bg-hub-muted p-3">
                    <p className="m-0 text-xs font-bold uppercase tracking-wider text-hub-soft">Notes</p>
                    <p className="m-0 mt-1 whitespace-pre-wrap text-sm font-medium leading-relaxed text-hub-ink">{lead.notes}</p>
                  </div>
                )}

                <div className="mt-3">
                  <p className="m-0 mb-1 text-[0.72rem] font-semibold uppercase tracking-wide text-hub-soft">Usage history</p>
                  <UsageHistory points={lead.usageHistory} />
                </div>

                {lead.source === 'customer' && !lead.archived && (
                  <WorkflowPanel
                    leadId={lead.id}
                    leadName={lead.name}
                    autoOpen={selected}
                    onOpenPricing={() => setPricingOpen(true)}
                  />
                )}

                {/* Sunrun Option B Workflow Integration for Option B Leads */}
                {(lead.source === 'customer' || lead.workflowOption === 'option_b_ownership') && (
                  <SunrunOptionBWorkflow lead={lead} />
                )}

                {lead.source === 'customer' && feed.writesEnabled && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-[40px] px-3 text-[0.84rem]"
                      onClick={() => { setFormError(null); setEditor({ mode: 'edit', lead }); }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    {lead.archived ? (
                      <Button type="button" variant="ghost" className="min-h-[40px] px-3 text-[0.84rem]" onClick={() => void restore(lead)}>
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="danger"
                        className="min-h-[40px] px-3 text-[0.84rem]"
                        onClick={() => { setArchiveError(null); setArchiveTarget(lead); }}
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-hub-line pt-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => downloadFile(`${lead.name.toLowerCase().replace(/\s+/g, '-')}-lead.csv`, leadsToCsvString([lead]), 'text/csv;charset=utf-8;')}
                      className="inline-flex items-center gap-1 rounded-lg border border-hub-line bg-hub-surface px-2 py-1 text-[0.74rem] font-medium text-hub-soft hover:bg-hub-muted"
                      title="Export this lead as CSV"
                    >
                      <FileSpreadsheet className="h-3 w-3 text-hub-success-ink" /> Lead CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadFile(`${lead.name.toLowerCase().replace(/\s+/g, '-')}-lead.json`, leadsToJsonString([lead]), 'application/json')}
                      className="inline-flex items-center gap-1 rounded-lg border border-hub-line bg-hub-surface px-2 py-1 text-[0.74rem] font-medium text-hub-soft hover:bg-hub-muted"
                      title="Export this lead as JSON"
                    >
                      <Download className="h-3 w-3 text-hub-accent-ink" /> Lead JSON
                    </button>
                  </div>
                  {lead.bill ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-hub-success-line bg-hub-success px-3 py-1.5">
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-[0.84rem]">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-hub-success-ink" />
                        <span className="max-w-[200px] truncate">{lead.bill.name || 'Light bill'}</span>
                      </span>
                      <Button
                        variant="ghost"
                        className="min-h-[32px] px-2.5 text-[0.8rem]"
                        onClick={() => void openBill(lead)}
                        disabled={opening === `${lead.source}:${lead.id}`}
                      >
                        <Eye className="h-3.5 w-3.5" /> {opening === `${lead.source}:${lead.id}` ? 'Opening…' : 'View bill'}
                      </Button>
                    </div>
                  ) : (
                    <span className="text-[0.8rem] text-hub-soft">No bill attached.</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editor && (
        <LeadForm
          mode={editor.mode}
          lead={editor.lead}
          busy={saving}
          error={formError}
          onClose={() => { if (!saving) setEditor(null); }}
          onSubmit={(draft, file) => void saveLead(draft, file)}
        />
      )}
      {pricingOpen && <PricingDialog onClose={() => setPricingOpen(false)} />}
      {archiveTarget && (
        <ArchiveLeadDialog
          name={archiveTarget.name}
          busy={archiving}
          error={archiveError}
          onCancel={() => { if (!archiving) setArchiveTarget(null); }}
          onConfirm={() => void confirmArchive()}
        />
      )}
    </section>
  );
}
