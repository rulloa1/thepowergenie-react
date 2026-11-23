import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UsageMonth } from '../../shared/types';
import { supabase } from '../lib/supabase';
import { isManualCreatedBy, isMissingArchiveColumn } from './leadRecord';
import { DEMO_LEADS } from './demoLeads';
import {
  type RoofDesignSpec,
  parseRoofDesignFromNotes,
  getSavedRoofDesign,
} from './roofDesign';

export type LeadSource = 'customer' | 'booking';

export type Lead = {
  id: string;
  source: LeadSource;
  sourceLabel: string;
  createdAt: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  kwh: number | null;
  amount: number | null;
  appointment: string | null;
  esiid: string | null;
  meterNumber: string | null;
  tdu: string | null;
  repPuctCertificate: string | null;
  avgMonthlyKwh: number | null;
  usageHistory: UsageMonth[] | null;
  bill: { bucket: string; path: string; name: string | null } | null;
  accountNumber: string | null;
  pastDue: number | null;
  currentCharges: number | null;
  totalDue: number | null;
  notes: string | null;
  utility: string | null;
  stage: string | null;
  createdBy: string | null;
  archived: boolean;
  days: number | null;
  avgKwhPerDay: number | null;
  kwhSameMonthLastYear: number | null;
  billDate: string | null;
  ratePlan: string | null;
  cancelled: boolean;
  unseen: boolean;
  referralRep?: string | null;
  referralState?: string | null;
  ownerEmailStatus?: string | null;
  workflowOption?: 'option_b_ownership' | 'option_a_ppa';
  roofDesign?: RoofDesignSpec | null;
};

export type LeadFeed = {
  leads: Lead[];
  loading: boolean;
  error: string | null;
  unseen: number;
  refresh: () => void;
  markSeen: (lead: Lead) => Promise<boolean>;
  /** False until the archive columns from the latest migration are present. */
  writesEnabled: boolean;
  /** True for the invitation-page sample desk. Nothing is saved. */
  sample: boolean;
  updateLead?: (id: string, updates: Partial<Lead>) => void;
  deleteLead?: (id: string) => void;
};

type CustomerRow = {
  id: string;
  created_at: string;
  customer_name: string | null;
  service_address: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  kwh_this_period: number | null;
  total_due: number | null;
  current_charges: number | null;
  past_due: number | null;
  account_number: string | null;
  appointment_date: string | null;
  esiid: string | null;
  meter_number: string | null;
  tdu: string | null;
  rep_puct_certificate: string | null;
  avg_monthly_kwh: number | null;
  usage_history: unknown;
  utility: string | null;
  stage: string | null;
  created_by: string | null;
  days: number | null;
  avg_kwh_per_day: number | null;
  kwh_same_month_last_year: number | null;
  bill_date: string | null;
  rate_plan: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
};

type FileRow = {
  id: string;
  customer_id: string | null;
  category: string;
  storage_path: string;
  file_name: string | null;
  created_at: string;
};

type AppointmentRow = {
  note?: string | null;
  referral_rep?: string | null;
  referral_state?: string | null;
  owner_email_status?: string | null;
  id: string;
  created_at: string;
  starts_at: string;
  status: 'booked' | 'cancelled';
  source: 'public' | 'dashboard';
  customer_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  kwh: number | null;
  bill_amount: number | null;
  esiid: string | null;
  meter_number: string | null;
  tdu: string | null;
  rep_puct_certificate: string | null;
  avg_monthly_kwh: number | null;
  usage_history: unknown;
  hub_appointment_files: Array<{
    bucket: string | null;
    storage_path: string;
    original_name: string | null;
    kind: string;
  }> | null;
};

type SeenRow = { source: string; lead_id: string };

const CUSTOMER_COLUMNS_BASE =
  'id,created_at,customer_name,service_address,phone,email,notes,kwh_this_period,total_due,current_charges,past_due,account_number,appointment_date,esiid,meter_number,tdu,rep_puct_certificate,avg_monthly_kwh,usage_history,utility,stage,created_by,days,avg_kwh_per_day,kwh_same_month_last_year,bill_date,rate_plan' as const;

const CUSTOMER_COLUMNS = `${CUSTOMER_COLUMNS_BASE},archived_at,archived_by` as const;

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asUsage(value: unknown): UsageMonth[] | null {
  if (!Array.isArray(value)) return null;
  const points: UsageMonth[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const month = (item as { month?: unknown }).month;
    const kwh = (item as { kwh?: unknown }).kwh;
    if (typeof month !== 'string' || typeof kwh !== 'number' || !Number.isFinite(kwh)) continue;
    points.push({ month, kwh });
  }
  return points.length ? points : null;
}

function noteValue(notes: string | null | undefined, label: string): string | null {
  if (!notes) return null;
  const prefix = `${label.toLowerCase()}:`;
  for (const line of notes.split('\n')) {
    if (line.toLowerCase().startsWith(prefix)) {
      const value = line.slice(prefix.length).trim();
      if (value) return value;
    }
  }
  return null;
}

function customerSource(notes: string | null, createdBy: string | null): string {
  if (isManualCreatedBy(createdBy)) return 'Manual entry';
  if (notes) {
    if (notes.includes('Referral source: celebrity-solar')) return 'Celebrity Solar';
    if (notes.includes('Referral source: hip-hop-solar')) return 'Hip-Hop Solar';
    if (notes.includes('Referral source: gas-genie')) return 'Gas-Genie';
    if (notes.includes('Referral source: sport-and-solar')) return 'Sport & Solar';
    if (notes.includes('Website assistant lead')) return 'Website assistant';
  }
  return 'Customer file';
}

export function leadsForView(leads: Lead[], view: 'active' | 'archived'): Lead[] {
  return leads.filter((lead) => (view === 'archived' ? (lead.archived || lead.cancelled) : (!lead.archived && !lead.cancelled)));
}

export function unseenActiveCount(leads: Lead[]): number {
  return leads.filter((lead) => lead.unseen && !lead.archived && !lead.cancelled).length;
}

function text(value: string | null | undefined): string | null {
  const trimmed = (value || '').trim();
  return trimmed || null;
}

export function toLeads(customers: CustomerRow[], files: FileRow[], appointments: AppointmentRow[], seenRows: SeenRow[]): Lead[] {
  const seen = new Set(seenRows.map((row) => `${row.source}:${row.lead_id}`));
  const bills = new Map<string, FileRow>();
  for (const file of files) {
    if (!file.customer_id || file.category !== 'light_bill' || !file.storage_path) continue;
    const current = bills.get(file.customer_id);
    if (!current || file.created_at > current.created_at) bills.set(file.customer_id, file);
  }

  const fromCustomers: Lead[] = customers.map((row) => {
    const file = bills.get(row.id);
    const total = asNumber(row.total_due);
    const current = asNumber(row.current_charges);
    return {
      id: row.id,
      source: 'customer',
      sourceLabel: customerSource(row.notes, text(row.created_by)),
      createdAt: row.created_at,
      name: text(row.customer_name) || 'Unnamed lead',
      phone: text(row.phone) || noteValue(row.notes, 'Phone'),
      email: text(row.email) || noteValue(row.notes, 'Email'),
      address: text(row.service_address),
      kwh: asNumber(row.kwh_this_period),
      amount: total != null ? total : current,
      appointment: text(row.appointment_date),
      esiid: text(row.esiid),
      meterNumber: text(row.meter_number),
      tdu: text(row.tdu),
      repPuctCertificate: text(row.rep_puct_certificate),
      avgMonthlyKwh: asNumber(row.avg_monthly_kwh),
      usageHistory: asUsage(row.usage_history),
      bill: file ? { bucket: 'powergenie', path: file.storage_path, name: file.file_name } : null,
      accountNumber: text(row.account_number),
      pastDue: asNumber(row.past_due),
      currentCharges: current,
      totalDue: total,
      notes: text(row.notes),
      utility: text(row.utility),
      stage: text(row.stage),
      createdBy: text(row.created_by),
      archived: Boolean(text(row.archived_at)),
      days: asNumber(row.days),
      avgKwhPerDay: asNumber(row.avg_kwh_per_day),
      kwhSameMonthLastYear: asNumber(row.kwh_same_month_last_year),
      billDate: text(row.bill_date),
      ratePlan: text(row.rate_plan),
      cancelled: false,
      unseen: !seen.has(`customer:${row.id}`),
      roofDesign: parseRoofDesignFromNotes(row.notes) || (row.id ? getSavedRoofDesign(row.id) : null) || null,
    };
  });

  const fromBookings: Lead[] = appointments.map((row) => {
    const file = (row.hub_appointment_files || []).find((item) => item.storage_path && item.kind === 'light_bill');
    return {
      id: row.id,
      source: 'booking',
      sourceLabel: row.source === 'public' ? 'Booking page' : 'Dashboard',
      createdAt: row.created_at,
      name: text(row.customer_name) || 'Unnamed lead',
      phone: text(row.phone),
      email: text(row.email),
      address: text(row.address),
      kwh: asNumber(row.kwh),
      amount: asNumber(row.bill_amount),
      appointment: text(row.starts_at),
      esiid: text(row.esiid),
      meterNumber: text(row.meter_number),
      tdu: text(row.tdu),
      repPuctCertificate: text(row.rep_puct_certificate),
      avgMonthlyKwh: asNumber(row.avg_monthly_kwh),
      usageHistory: asUsage(row.usage_history),
      bill: file
        ? { bucket: file.bucket || 'hub-light-bills', path: file.storage_path, name: file.original_name }
        : null,
      accountNumber: null,
      pastDue: null,
      currentCharges: null,
      totalDue: null,
      notes: text(row.note),
      referralRep: text(row.referral_rep),
      referralState: text(row.referral_state),
      ownerEmailStatus: text(row.owner_email_status),
      utility: null,
      stage: null,
      createdBy: null,
      archived: row.status === 'cancelled',
      days: null,
      avgKwhPerDay: null,
      kwhSameMonthLastYear: null,
      billDate: null,
      ratePlan: null,
      cancelled: row.status === 'cancelled',
      unseen: !seen.has(`booking:${row.id}`),
      roofDesign: parseRoofDesignFromNotes(row.note) || (row.id ? getSavedRoofDesign(row.id) : null) || null,
    };
  });

  return [...fromCustomers, ...fromBookings].sort((left, right) => {
    const delta = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    if (Number.isFinite(delta) && delta !== 0) return delta;
    return right.id < left.id ? -1 : right.id > left.id ? 1 : 0;
  });
}

export function useLeadFeed(userId: string): LeadFeed {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [writesEnabled, setWritesEnabled] = useState(false);
  const sample = userId.startsWith('demo-');

  const load = useCallback(async (silent = false) => {
    if (userId.startsWith('demo-')) {
      setWritesEnabled(true);
      setError(null);
      setLeads(DEMO_LEADS);
      setLoading(false);
      return;
    }
    if (!supabase) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    const [customerQuery, files, appointments, seen] = await Promise.all([
      supabase.from('powergenie_customers').select(CUSTOMER_COLUMNS).order('created_at', { ascending: false }).limit(300),
      supabase.from('powergenie_files').select('id, customer_id, category, storage_path, file_name, created_at').eq('category', 'light_bill').limit(500),
      supabase.from('hub_appointments').select('*, hub_appointment_files(*)').order('created_at', { ascending: false }).limit(300),
      supabase.from('hub_lead_seen').select('source, lead_id').eq('user_id', userId),
    ]);
    let customerRows: unknown = customerQuery.data;
    let customerError: { code?: string; message: string } | null = customerQuery.error;
    let canWrite = true;
    if (customerError && isMissingArchiveColumn(customerError)) {
      canWrite = false;
      const legacy = await supabase.from('powergenie_customers').select(CUSTOMER_COLUMNS_BASE).order('created_at', { ascending: false }).limit(300);
      customerRows = legacy.data;
      customerError = legacy.error;
    }
    if (customerError || files.error || appointments.error || seen.error) {
      setWritesEnabled(false);
      setError("Couldn't load leads. Apply the latest database migration, then refresh.");
      if (!silent) setLoading(false);
      return;
    }
    setError(null);
    setWritesEnabled(canWrite);
    setLeads(toLeads(
      (customerRows ?? []) as unknown as CustomerRow[],
      (files.data ?? []) as unknown as FileRow[],
      (appointments.data ?? []) as unknown as AppointmentRow[],
      (seen.data ?? []) as unknown as SeenRow[],
    ));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load(false);
    const client = supabase;
    if (!client || userId.startsWith('demo-')) return;
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void load(true);
      }, 300);
    };
    const channel = client
      .channel(`hub-leads-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'powergenie_customers' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'powergenie_files' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hub_appointments' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hub_appointment_files' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hub_lead_seen' }, schedule)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [load, userId]);

  const markSeen = useCallback(async (lead: Lead) => {
    if (!lead.unseen) return true;
    if (!supabase || userId.startsWith('demo-')) {
      setLeads((current) => current.map((item) => (
        item.source === lead.source && item.id === lead.id ? { ...item, unseen: false } : item
      )));
      return true;
    }
    setLeads((current) => current.map((item) => (
      item.source === lead.source && item.id === lead.id ? { ...item, unseen: false } : item
    )));
    const { error: writeError } = await supabase.from('hub_lead_seen').upsert({
      user_id: userId,
      source: lead.source,
      lead_id: lead.id,
      seen_at: new Date().toISOString(),
    }, { onConflict: 'user_id,source,lead_id' });
    if (writeError) {
      setLeads((current) => current.map((item) => (
        item.source === lead.source && item.id === lead.id ? { ...item, unseen: true } : item
      )));
      return false;
    }
    return true;
  }, [userId]);

  const unseen = useMemo(() => unseenActiveCount(leads), [leads]);

  const updateLead = useCallback((id: string, updates: Partial<Lead>) => {
    setLeads((prev) =>
      prev.map((lead) => {
        if (lead.id !== id) return lead;
        return { ...lead, ...updates };
      })
    );
  }, []);

  const deleteLead = useCallback((id: string) => {
    setLeads((prev) => prev.filter((lead) => lead.id !== id));
  }, []);

  return {
    leads,
    loading,
    error,
    unseen,
    writesEnabled,
    sample,
    updateLead,
    deleteLead,
    refresh: () => {
      void load(false);
    },
    markSeen,
  };
}
