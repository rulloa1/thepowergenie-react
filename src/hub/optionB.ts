/**
 * Sunrun Option B workflow stored beside a customer's private files.
 * The browser only learns that a lead has this section by downloading
 * `customers/{leadId}/option-b.json` from the private `powergenie` bucket.
 * Personal details in that file are filled from the lead row when the
 * template uses a {{token}}.
 */

export type WorkflowLead = {
  name: string;
  address: string | null;
  accountNumber: string | null;
  meterNumber: string | null;
  phone: string | null;
  pastDue: number | null;
  currentCharges: number | null;
  amount: number | null;
  tdu: string | null;
};

export type WorkflowStat = { label: string; value: string; detail: string };

export type WorkflowDocument = {
  id: string;
  label: string;
  path: string;
  preview: boolean;
};

export type WorkflowStep = {
  id: string;
  title: string;
  description: string;
  urgent: boolean;
  phone: string | null;
  actionLabel: string | null;
  documentId: string | null;
};

export type OptionBWorkflow = {
  title: string;
  subtitle: string;
  urgentTitle: string | null;
  urgentBody: string | null;
  urgentPhone: string | null;
  urgentActionLabel: string | null;
  showLeadNotes: boolean;
  showBalances: boolean;
  planTitle: string | null;
  planDescription: string | null;
  footer: string | null;
  advisor: string | null;
  stats: WorkflowStat[];
  documents: WorkflowDocument[];
  steps: WorkflowStep[];
};

const TOKEN = /\{\{(name|address|accountNumber|meter|phone|pastDue|currentCharges|totalDue|utility)\}\}/g;

function money(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function clip(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/[ \t]+/g, ' ').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** `tel:` only. Anything else is dropped so a workflow file cannot set a javascript: link. */
export function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const compact = phone.replace(/[^\d+]/g, '');
  if (!/^\+?[0-9]{10,15}$/.test(compact)) return null;
  return `tel:${compact}`;
}

/**
 * A private object path for this lead. Rejects other customers' folders,
 * traversal, and absolute URLs.
 */
export function customerObjectPath(leadId: string, objectPath: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(leadId)) return null;
  const path = objectPath.trim();
  const prefix = `customers/${leadId}/`;
  if (!path.startsWith(prefix)) return null;
  if (path.includes('..') || path.includes('\\') || path.includes('://') || path.includes('//')) return null;
  const rest = path.slice(prefix.length);
  if (!rest || !/^[A-Za-z0-9._/-]{1,160}$/.test(rest)) return null;
  return path;
}

export function optionBObjectPath(leadId: string): string | null {
  return customerObjectPath(leadId, `customers/${leadId}/option-b.json`);
}

export function canPreviewObject(path: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(path);
}

export function fillWorkflowTemplate(template: string, lead: WorkflowLead): string {
  const values: Record<string, string> = {
    name: lead.name,
    address: lead.address || 'the service address on file',
    accountNumber: lead.accountNumber || 'the account on file',
    meter: lead.meterNumber || 'the meter on file',
    phone: lead.phone || 'the phone on file',
    pastDue: money(lead.pastDue),
    currentCharges: money(lead.currentCharges),
    totalDue: money(lead.amount),
    utility: lead.tdu || 'the utility on file',
  };
  return template.replace(TOKEN, (_match, key: string) => values[key] ?? '');
}

function parseDocument(value: unknown, leadId: string): WorkflowDocument | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = clip(record.id, 40);
  const label = clip(record.label, 80);
  const path = typeof record.path === 'string' ? customerObjectPath(leadId, record.path) : null;
  if (!id || !/^[A-Za-z0-9_-]{1,40}$/.test(id) || !label || !path) return null;
  return { id, label, path, preview: record.preview === true };
}

function parseStep(value: unknown, documentIds: Set<string>): WorkflowStep | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = clip(record.id, 40);
  const title = clip(record.title, 160);
  const description = clip(record.description, 600);
  if (!id || !/^[A-Za-z0-9_-]{1,40}$/.test(id) || !title || !description) return null;
  const documentId = clip(record.documentId, 40);
  const phone = clip(record.phone, 24);
  return {
    id,
    title,
    description,
    urgent: record.urgent === true,
    phone: phone && telHref(phone) ? phone : null,
    actionLabel: clip(record.actionLabel, 80),
    documentId: documentId && documentIds.has(documentId) ? documentId : null,
  };
}

export function parseOptionBWorkflow(raw: string, leadId: string): OptionBWorkflow | null {
  if (raw.length > 100_000) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const title = clip(record.title, 140);
  const subtitle = clip(record.subtitle, 240);
  if (!title || !subtitle) return null;

  const stats: WorkflowStat[] = [];
  if (Array.isArray(record.stats)) {
    for (const item of record.stats.slice(0, 8)) {
      if (!item || typeof item !== 'object') continue;
      const stat = item as Record<string, unknown>;
      const label = clip(stat.label, 40);
      const value = clip(stat.value, 40);
      const detail = clip(stat.detail, 120);
      if (label && value && detail) stats.push({ label, value, detail });
    }
  }

  const documents: WorkflowDocument[] = [];
  if (Array.isArray(record.documents)) {
    for (const item of record.documents.slice(0, 8)) {
      const document = parseDocument(item, leadId);
      if (document && !documents.some((existing) => existing.id === document.id)) documents.push(document);
    }
  }
  const documentIds = new Set(documents.map((document) => document.id));

  const steps: WorkflowStep[] = [];
  if (!Array.isArray(record.steps)) return null;
  for (const item of record.steps.slice(0, 20)) {
    const step = parseStep(item, documentIds);
    if (step && !steps.some((existing) => existing.id === step.id)) steps.push(step);
  }
  if (!steps.length) return null;

  return {
    title,
    subtitle,
    urgentTitle: clip(record.urgentTitle, 160),
    urgentBody: clip(record.urgentBody, 400),
    urgentPhone: (() => {
      const phone = clip(record.urgentPhone, 24);
      return phone && telHref(phone) ? phone : null;
    })(),
    urgentActionLabel: clip(record.urgentActionLabel, 80),
    showLeadNotes: record.showLeadNotes === true,
    showBalances: record.showBalances === true,
    planTitle: clip(record.planTitle, 140),
    planDescription: clip(record.planDescription, 240),
    footer: clip(record.footer, 240),
    advisor: clip(record.advisor, 120),
    stats,
    documents,
    steps,
  };
}
