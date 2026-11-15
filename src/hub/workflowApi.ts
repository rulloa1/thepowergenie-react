import type { LeadOverrides, PricingSettings, SavingsResult, SystemSize, UsageEstimate } from '../../shared/workflow';
import { supabase } from '../lib/supabase';

export type WorkflowTask = {
  id: string;
  lead_id: string;
  kind: string;
  title: string;
  detail: string | null;
  due_at: string;
  done_at: string | null;
  done_by_name: string | null;
  cancelled_at: string | null;
  leadName?: string;
};

export type WorkflowFollowup = {
  id: string;
  key: string;
  stage: string;
  channel: 'email' | 'sms';
  send_at: string;
  status: 'scheduled' | 'sent' | 'skipped' | 'failed' | 'cancelled';
  subject: string | null;
  body: string;
  sent_at: string | null;
  note: string | null;
};

export type WorkflowProposal = {
  id: string;
  status: 'draft' | 'approved' | 'sent' | 'superseded';
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  sentAt: string | null;
  sentChannels: string[];
  viewedAt: string | null;
  viewCount: number;
  interestedAt: string | null;
  url: string | null;
  summary: {
    panels: number;
    kw: number;
    savingsMonthly: number;
    savingsTotal: number;
    planMonthly: number;
    billNowMonthly: number;
    offsetPct: number;
    preliminary: boolean;
    roof: 'ok' | 'none';
  };
};

export type DesignStatus = 'pending' | 'ok' | 'no_key' | 'not_found' | 'no_address' | 'error';

export type LeadWorkflow = {
  stage: string;
  stages: string[];
  rateReady: boolean;
  googleReady: boolean;
  smsConsent: boolean;
  workflow: {
    overrides: LeadOverrides;
    usage: UsageEstimate | null;
    system: SystemSize | null;
    savings: Omit<SavingsResult, 'schedule'> | null;
    designStatus: DesignStatus;
    designNote: string | null;
    designPanels: number;
    optedOut: boolean;
    updatedAt: string;
  } | null;
  proposals: WorkflowProposal[];
  tasks: WorkflowTask[];
  followups: WorkflowFollowup[];
};

export type ApproveResult = { status: 'sent' | 'approved'; channels: string[]; url: string; note: string | null };

export class WorkflowError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(action: string, init: { method?: 'GET' | 'POST'; query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  if (!supabase) throw new WorkflowError('The hub is not connected.', 503);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new WorkflowError('Sign in again to use the workflow.', 401);
  const params = new URLSearchParams({ route: 'workflow', action, ...(init.query || {}) });
  const response = await fetch(`/api/assistant?${params.toString()}`, {
    method: init.method || 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !payload) {
    throw new WorkflowError(payload?.error || 'The workflow did not answer. Please try again.', response.status);
  }
  return payload;
}

export const workflowApi = {
  lead: (leadId: string) => call<LeadWorkflow>('lead', { query: { id: leadId } }),
  run: (leadId: string) => call<LeadWorkflow>('run', { method: 'POST', body: { leadId } }),
  overrides: (leadId: string, overrides: LeadOverrides) => call<LeadWorkflow>('overrides', { method: 'POST', body: { leadId, overrides } }),
  approve: (proposalId: string, send: boolean) => call<ApproveResult>('approve', { method: 'POST', body: { proposalId, send } }),
  shared: (proposalId: string) => call<{ ok: true }>('shared', { method: 'POST', body: { proposalId } }),
  task: (taskId: string, done: boolean) => call<{ ok: true }>('task', { method: 'POST', body: { taskId, done } }),
  cancelFollowup: (followupId: string) => call<{ ok: true }>('cancel-followup', { method: 'POST', body: { followupId } }),
  deleteLead: (leadId: string) => call<{ ok: true }>('delete-lead', { method: 'POST', body: { leadId } }),
  preview: (proposalId: string) => call<{ html: string }>('preview', { query: { proposal: proposalId } }),
  tasks: () => call<{ rateReady: boolean; googleReady: boolean; tasks: WorkflowTask[] }>('tasks'),
  glance: (leadIds: string[]) => call<{ savings: Array<{ leadId: string; monthly: number | null }> }>('glance', { query: { ids: leadIds.join(',') } }),
  settings: () => call<{ pricing: PricingSettings; googleReady: boolean }>('settings'),
  saveSettings: (pricing: PricingSettings) => call<{ pricing: PricingSettings }>('settings', { method: 'POST', body: { pricing } }),
};

/** Lets the leads list, task strip and lead panels refresh each other. */
export const WORKFLOW_CHANGED = 'powergenie:workflow-changed';

export function announceWorkflowChange(leadId?: string): void {
  window.dispatchEvent(new CustomEvent(WORKFLOW_CHANGED, { detail: { leadId } }));
}

export function money(value: number | null | undefined, cents = false): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  return `${value < 0 ? '-' : ''}$${abs}`;
}

export function dueLabel(iso: string, now = Date.now()): { text: string; overdue: boolean } {
  const due = Date.parse(iso);
  if (!Number.isFinite(due)) return { text: '', overdue: false };
  const diff = due - now;
  const hours = Math.round(Math.abs(diff) / 3_600_000);
  if (diff < 0) {
    return { text: hours < 1 ? 'Due now' : hours < 24 ? `${hours}h overdue` : `${Math.round(hours / 24)}d overdue`, overdue: true };
  }
  if (hours < 1) return { text: 'Due now', overdue: false };
  if (hours < 24) return { text: `Due in ${hours}h`, overdue: false };
  return { text: `Due in ${Math.round(hours / 24)}d`, overdue: false };
}
