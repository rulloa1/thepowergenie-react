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
import { archiveCustomerLead, createManualLead, restoreCustomerLead, updateManualLead } from './leadActions';
import { stageLabel, type LeadActor, type LeadDraft } from './leadRecord';
import { Button, Notice, Spinner, cn } from './ui';
import { formatDateTime } from './time';
import {
  downloadFile,
  generateProposalEmailUrl,
  generateProposalSmsUrl,
  getProposalUrl,
  leadsToCsvString,
  leadsToJsonString,
  solarProposalScheduleToCsv,
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
  if (!points?.length) return <p className="m-0 text-[0.86rem] text-[#6B7280]">No usage history on the bill.</p>;
  const max = Math.max(...points.map((point) => point.kwh), 1);
  const years = new Set(points.map((point) => point.month.slice(0, 4)));
  const withYear = years.size > 1;
  const summary = points.map((point) => `${point.month} ${Math.round(point.kwh).toLocaleString('en-US')} kWh`).join(', ');
  return (
    <div className="rounded-xl border border-[#EEF2F6] bg-[#F8FAFC]/70 p-2.5">
      <div className="overflow-x-auto" role="img" aria-label={`Monthly usage: ${summary}`}>
        <div className="flex h-24 items-end gap-1.5" style={{ minWidth: Math.max(points.length * 34, 160) }}>
          {points.map((point) => (
            <div key={point.month} className="group flex min-w-7 flex-1 flex-col items-center justify-end gap-1" title={`${point.month}: ${point.kwh} kWh`}>
              <span className="text-[0.62rem] font-bold text-[#475569] transition-colors group-hover:text-[#FF6B00]">{Math.round(point.kwh)}</span>
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-[#FF6B00] to-[#FFA25B] shadow-sm transition-all group-hover:brightness-110"
                style={{ height: `${Math.max(8, (point.kwh / max) * 52)}px` }}
              />
              <span className="text-[0.62rem] font-medium text-[#64748B]">{monthLabel(point.month, withYear)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 transition-colors hover:border-[#CBD5E1]">
      <dt className="text-[0.68rem] font-bold uppercase tracking-wider text-[#64748B]">{label}</dt>
      <dd className="m-0 mt-0.5 break-words text-[0.92rem] font-bold text-[#0F172A]">{children}</dd>
    </div>
  );
}

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
    <div className="mt-4 rounded-2xl border-2 border-[#FF6B00] bg-[#FFFBF7] p-4 text-[#1A1A2E] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#FFE0CC] pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FF6B00] text-white">
            <Zap className="h-4 w-4" />
          </span>
          <div>
            <h3 className="m-0 text-[1.05rem] font-bold text-[#1A1A2E]">{workflow.title}</h3>
            <p className="m-0 text-[0.78rem] text-[#6B7280]">{fillWorkflowTemplate(workflow.subtitle, lead)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex items-center gap-1 text-[0.8rem] font-semibold text-[#FF6B00] hover:underline"
        >
          {open ? <>Collapse <ChevronUp className="h-4 w-4" /></> : <>Expand <ChevronDown className="h-4 w-4" /></>}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {(workflow.urgentTitle || workflow.urgentBody) && (
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-3.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#DC2626]" />
                <div className="text-[0.85rem] leading-relaxed text-[#991B1B]">
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
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#DC2626] px-3.5 py-2 text-[0.82rem] font-bold text-white no-underline shadow hover:bg-[#B91C1C]"
                >
                  <Phone className="h-3.5 w-3.5" /> {workflow.urgentActionLabel}
                </a>
              )}
            </div>
          )}

          {workflow.stats.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {workflow.stats.map((stat) => (
                <div key={stat.label} className="rounded-xl border border-[#E3E8EF] bg-white p-3">
                  <span className="block text-[0.68rem] font-bold uppercase text-[#6B7280]">{stat.label}</span>
                  <strong className="text-[1.1rem] font-extrabold text-[#1A1A2E]">{fillWorkflowTemplate(stat.value, lead)}</strong>
                  <span className="block text-[0.72rem] text-[#6B7280]">{fillWorkflowTemplate(stat.detail, lead)}</span>
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between text-[0.76rem] font-semibold text-[#4A5568]">
              <span>Sunrun implementation progress</span>
              <span>{doneCount} of {workflow.steps.length} completed ({pct}%)</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
              <div className="h-full rounded-full bg-[#FF6B00] transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {workflow.documents.length > 0 && (
            <div className="rounded-xl border border-[#CBD5E1] bg-white p-3.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  {workflow.planTitle && <h4 className="m-0 text-[0.92rem] font-bold text-[#1A1A2E]">{workflow.planTitle}</h4>}
                  {workflow.planDescription && (
                    <p className="m-0 text-[0.78rem] text-[#6B7280]">{fillWorkflowTemplate(workflow.planDescription, lead)}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {workflow.documents.map((document) => (
                    <button
                      key={document.id}
                      type="button"
                      onClick={() => void openFile(document.path)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#0F172A] bg-[#0F172A] px-3 py-1.5 text-[0.78rem] font-bold text-white shadow hover:bg-[#1E293B]"
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
                      className="rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-[0.78rem] font-semibold text-[#FF6B00] hover:bg-[#FFF5EC]"
                    >
                      {previewPath === document.path ? `Hide ${document.label}` : `Show ${document.label}`}
                    </button>
                  ))}
                </div>
              )}
              {previewUrl && (
                <div className="mt-3 overflow-hidden rounded-lg border border-[#94A3B8] bg-[#001020]">
                  <img src={previewUrl} alt={workflow.planTitle || 'Customer plan'} className="w-full object-contain" />
                  <p className="m-0 bg-[#0A192F] p-2 text-center text-[0.72rem] text-[#94A3B8]">
                    Signed link for this hub session. It expires shortly.
                  </p>
                </div>
              )}
            </div>
          )}

          {htmlBusy && <p className="m-0 text-[0.84rem] text-[#6B7280]">Opening document…</p>}
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
                      ? 'border-[#BFE3C6] bg-[#F3FAF5]'
                      : step.urgent
                        ? 'border-[#FCA5A5] bg-white'
                        : 'border-[#E3E8EF] bg-white hover:border-[#CBD5E1]',
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => toggleStep(step.id)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={step.title}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-[#FF6B00] focus:ring-[#FF6B00]"
                    />
                    <div>
                      <h4 className={cn('m-0 text-[0.88rem] font-bold', isDone && 'text-[#6B7280] line-through')}>
                        {step.title}
                      </h4>
                      <p className="m-0 mt-0.5 text-[0.8rem] leading-snug text-[#4A5568]">
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
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#FF6B00] px-2.5 py-1 text-[0.74rem] font-bold text-[#FF6B00] no-underline hover:bg-[#FFF5EC]"
                    >
                      {step.actionLabel || document.label}
                    </button>
                  )}
                  {!isDone && !document && stepTel && step.actionLabel && (
                    <a
                      href={stepTel}
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#FF6B00] px-2.5 py-1 text-[0.74rem] font-bold text-[#FF6B00] no-underline hover:bg-[#FFF5EC]"
                    >
                      {step.actionLabel}
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {(workflow.footer || workflow.advisor) && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#FFE0CC] pt-3 text-[0.78rem] text-[#6B7280]">
              {workflow.footer && (
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-[#1E7B34]" />
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
        className="fixed inset-0 z-[80] flex items-stretch justify-center bg-[#0A1220]/70 p-2 sm:p-4"
        onClick={() => setHtmlView(null)}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="html-doc-title"
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
          className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E3E8EF] px-4 py-3">
            <h2 id="html-doc-title" className="m-0 text-base font-bold text-[#1A1A2E]">{htmlView.label}</h2>
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
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E3E8EF] text-[#1A1A2E] hover:border-[#1A1A2E]"
                aria-label="Close document"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {fileError && <p className="m-0 border-b border-[#F3C2BB] bg-[#FFF0EE] px-4 py-2 text-[0.84rem] text-[#8A1F11]" role="alert">{fileError}</p>}
          <iframe
            title={htmlView.label}
            sandbox={HTML_PREVIEW_SANDBOX}
            referrerPolicy="no-referrer"
            srcDoc={htmlView.html}
            className="min-h-0 w-full flex-1 border-0 bg-white"
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
  const marked = useRef(new Set<string>());
  const scrolled = useRef<string | null>(null);
  const actor: LeadActor = { id: profile.id, fullName: profile.full_name, email: profile.email };
  const shown = leadsForView(feed.leads, view);
  const archivedCount = feed.leads.filter((lead) => lead.archived).length;

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
    <section aria-label="Leads" className="rounded-3xl bg-white p-4 shadow-[0_10px_30px_rgba(10,20,40,0.06)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-bold">Leads</h2>
          <p className="m-0 text-[0.86rem] text-[#6B7280]">Website assistant, booking page, and leads you add, newest first</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {feed.writesEnabled && (
            <Button type="button" variant="accent" className="min-h-[40px] w-full px-3 sm:w-auto" onClick={() => { setFormError(null); setEditor({ mode: 'create', lead: null }); }}>
              <Plus className="h-4 w-4" /> Add lead
            </Button>
          )}
          {shown.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => downloadFile('powergenie-all-leads.csv', leadsToCsvString(shown), 'text/csv;charset=utf-8;')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E3E8EF] bg-white px-3 py-1.5 text-[0.78rem] font-semibold text-[#1A1A2E] shadow-sm hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
                title="Download all leads in CSV format"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-[#1E7B34]" /> Export CSV
              </button>
              <button
                type="button"
                onClick={() => downloadFile('powergenie-all-leads.json', leadsToJsonString(shown), 'application/json')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E3E8EF] bg-white px-3 py-1.5 text-[0.78rem] font-semibold text-[#1A1A2E] shadow-sm hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
                title="Download all leads in JSON format"
              >
                <Download className="h-3.5 w-3.5 text-[#FF6B00]" /> Export JSON
              </button>
            </>
          )}
          <button
            onClick={feed.refresh}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E3E8EF] hover:border-[#1A1A2E]"
            aria-label="Refresh leads"
          >
            <RefreshCw className={cn('h-4 w-4', feed.loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-2" role="tablist" aria-label="Lead lists">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'active'}
          onClick={() => setView('active')}
          className={cn(
            'min-h-[40px] flex-1 rounded-full px-3 text-[0.84rem] font-bold sm:flex-none',
            view === 'active' ? 'bg-[#1A1A2E] text-white' : 'border border-[#E3E8EF] bg-white text-[#334155]',
          )}
        >
          Active
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'archived'}
          onClick={() => setView('archived')}
          className={cn(
            'min-h-[40px] flex-1 rounded-full px-3 text-[0.84rem] font-bold sm:flex-none',
            view === 'archived' ? 'bg-[#1A1A2E] text-white' : 'border border-[#E3E8EF] bg-white text-[#334155]',
          )}
        >
          Archived{archivedCount > 0 ? ` (${archivedCount})` : ''}
        </button>
      </div>

      {feed.error && <div className="mt-4"><Notice tone="error">{feed.error}</Notice></div>}
      {!feed.loading && !feed.error && !feed.writesEnabled && (
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
        <div className="py-10 text-center text-[#6B7280]"><Spinner /></div>
      ) : shown.length === 0 && !feed.error ? (
        <p className="py-10 text-center text-[#6B7280]">
          {view === 'archived'
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
                  lead.cancelled ? 'border-[#EEF1F5] bg-[#FAFBFD] opacity-70' : 'border-[#E3E8EF] bg-white',
                  selected && 'ring-2 ring-[#FF6B00]',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button type="button" onClick={() => select(lead)} className="min-w-0 flex-1 text-left">
                    <span className="flex flex-wrap items-center gap-2">
                      {lead.unseen && (
                        <span className="rounded-full bg-[#FF6B00] px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide text-white">New</span>
                      )}
                      <span className="rounded-full bg-[#FFF5EC] px-2 py-0.5 text-[0.72rem] font-semibold text-[#C2410C]">{lead.sourceLabel}</span>
                      {lead.stage && <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[0.72rem] font-semibold text-[#334155]">{stageLabel(lead.stage)}</span>}
                      {lead.archived && <span className="rounded-full bg-[#F1F3F7] px-2 py-0.5 text-[0.72rem] font-semibold text-[#4A5568]">Archived</span>}
                      {lead.cancelled && <span className="rounded-full bg-[#F1F3F7] px-2 py-0.5 text-[0.72rem] font-semibold text-[#4A5568]">Cancelled</span>}
                    </span>
                    <span className={cn('mt-1 block text-[1.05rem] font-bold', lead.cancelled && 'line-through')}>{lead.name}</span>
                  </button>
                  <span className="text-[0.78rem] text-[#6B7280]">{formatWhen(lead.createdAt)}</span>
                </div>

                <div className="mt-2 grid gap-1 text-[0.9rem] text-[#334155]">
                  {lead.phone && (
                    <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-2 text-inherit no-underline">
                      <Phone className="h-4 w-4 text-[#8A94A3]" />{lead.phone}
                    </a>
                  )}
                  {lead.email && (
                    <a href={`mailto:${lead.email}`} className="inline-flex min-w-0 items-center gap-2 break-all text-inherit no-underline">
                      <Mail className="h-4 w-4 shrink-0 text-[#8A94A3]" />{lead.email}
                    </a>
                  )}
                  {lead.address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-inherit no-underline"
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-[#8A94A3]" />{lead.address}
                    </a>
                  )}
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Fact label="kWh">{formatKwh(lead.kwh)}</Fact>
                  <Fact label="Bill amount">{formatMoney(lead.amount)}</Fact>
                  <Fact label="Appointment">{formatWhen(lead.appointment)}</Fact>
                  <Fact label="Account #">{lead.accountNumber || '—'}</Fact>
                  <Fact label="ESI ID">{lead.esiid || '—'}</Fact>
                  <Fact label="Meter">{lead.meterNumber || '—'}</Fact>
                  <Fact label="Average monthly">{lead.avgMonthlyKwh == null ? '—' : formatKwh(lead.avgMonthlyKwh)}</Fact>
                </dl>
                {((lead.utility && lead.utility !== 'Not provided') || lead.tdu || lead.repPuctCertificate) && (
                  <p className="m-0 mt-2 text-[0.82rem] text-[#4A5568]">
                    {lead.utility && lead.utility !== 'Not provided' ? <>Utility {lead.utility}</> : null}
                    {lead.utility && lead.utility !== 'Not provided' && lead.tdu ? ' · ' : null}
                    {lead.tdu ? <>TDU {lead.tdu}</> : null}
                    {((lead.utility && lead.utility !== 'Not provided') || lead.tdu) && lead.repPuctCertificate ? ' · ' : null}
                    {lead.repPuctCertificate ? <>PUCT {lead.repPuctCertificate}</> : null}
                  </p>
                )}
                {lead.notes && (
                  <p className="m-0 mt-2 line-clamp-3 whitespace-pre-wrap text-[0.84rem] text-[#334155]">{lead.notes}</p>
                )}

                <div className="mt-3">
                  <p className="m-0 mb-1 text-[0.72rem] font-semibold uppercase tracking-wide text-[#6B7280]">Usage history</p>
                  <UsageHistory points={lead.usageHistory} />
                </div>

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

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#EEF1F5] pt-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => downloadFile(`${lead.name.toLowerCase().replace(/\s+/g, '-')}-lead.csv`, leadsToCsvString([lead]), 'text/csv;charset=utf-8;')}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E3E8EF] bg-white px-2 py-1 text-[0.74rem] font-medium text-[#4A5568] hover:bg-[#F8FAFC]"
                      title="Export this lead as CSV"
                    >
                      <FileSpreadsheet className="h-3 w-3 text-[#1E7B34]" /> Lead CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadFile(`${lead.name.toLowerCase().replace(/\s+/g, '-')}-lead.json`, leadsToJsonString([lead]), 'application/json')}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E3E8EF] bg-white px-2 py-1 text-[0.74rem] font-medium text-[#4A5568] hover:bg-[#F8FAFC]"
                      title="Export this lead as JSON"
                    >
                      <Download className="h-3 w-3 text-[#FF6B00]" /> Lead JSON
                    </button>
                  </div>
                  {lead.bill ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#BFE3C6] bg-[#EEF9F0] px-3 py-1.5">
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-[0.84rem]">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-[#1E7B34]" />
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
                    <span className="text-[0.8rem] text-[#6B7280]">No bill attached.</span>
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
