import { describe, expect, it } from 'vitest';
import type { BillFields } from '../../shared/types';
import {
  applyBillToDraft,
  buildArchivePatch,
  buildCustomerUpdate,
  buildLightBillFile,
  buildManualCustomerInsert,
  buildRestorePatch,
  emptyDraft,
  isMissingArchiveColumn,
  manualCreatedBy,
  validateDraft,
} from './leadRecord';

const actor = { id: '11111111-1111-4111-8111-111111111111', fullName: 'Horace Lawrence', email: 'horace.lawrence@sunrun.com' };
const now = new Date('2026-10-25T15:00:00.000Z');

function draftWith(overrides: Partial<ReturnType<typeof emptyDraft>> = {}) {
  return {
    ...emptyDraft(),
    name: 'Casey Nguyen',
    address: '18 Maple Street, Houston, TX 77008',
    phone: '713-555-0148',
    email: 'Casey@Example.com',
    ...overrides,
  };
}

describe('manual lead rows', () => {
  it('uses a text timestamp, the first stage, and a manual created_by', () => {
    const row = buildManualCustomerInsert(draftWith(), actor, now, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(row.id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(row.created_at).toBe('2026-10-25T15:00:00.000Z');
    expect(row.updated_at).toBe('2026-10-25T15:00:00.000Z');
    expect(row.logged_on).toBe('2026-10-25');
    expect(row.date_sent_to_horace).toBe('2026-10-25');
    expect(row.stage).toBe('bill_received');
    expect(row.created_by).toBe(manualCreatedBy(actor.id));
    expect(row.utility).toBe('Not provided');
    expect(row.email).toBe('casey@example.com');
    expect(row.appointment_date).toBeUndefined();
    expect(row.archived_at).toBeUndefined();
    expect(row.acknowledged).toBeUndefined();
  });

  it('keeps a Gmail note exactly, including the message id', () => {
    const notes = 'Gmail message 18abcdef123\nAccount matched on ESI ID';
    const row = buildCustomerUpdate(draftWith({ notes, stage: 'savings_calc' }), now);
    expect(row.notes).toBe(notes);
    expect(row.stage).toBe('savings_calc');
    expect(row.created_by).toBeUndefined();
    expect(row.created_at).toBeUndefined();
    expect(row.logged_on).toBeUndefined();
    expect(row.appointment_date).toBeUndefined();
    expect(row.id).toBeUndefined();
  });

  it('derives daily kWh and cents the same way as a website lead', () => {
    const row = buildManualCustomerInsert(draftWith({
      kwh: '1100',
      days: '30',
      currentCharges: '168.40',
      totalDue: '168.40',
      esiid: '1044-3720-0123-45678',
    }), actor, now, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(row.kwh_this_period).toBe(1100);
    expect(row.days).toBe(30);
    expect(row.avg_kwh_per_day).toBe(36.7);
    expect(row.est_cents_per_kwh).toBe(15.309);
    expect(row.esiid).toBe('10443720012345678');
  });

  it('fills blank fields from a bill and leaves a typed name alone', () => {
    const bill = {
      customerName: 'Alex Morgan',
      serviceAddress: '456 Oak Lane, Houston, TX 77008',
      utility: 'Entergy Texas',
      accountNumber: '100200300',
      billDate: '2026-09-20',
      ratePlan: 'RS',
      kwhThisPeriod: 1100,
      days: 30,
      kwhSameMonthLastYear: 980,
      currentCharges: 168.4,
      totalDue: 168.4,
      pastDue: 0,
      esiid: '10443720012345678',
      meterNumber: 'A12345678',
      tdu: 'CenterPoint Energy',
      repPuctCertificate: '10094',
      avgMonthlyKwh: 1050,
      usageHistory: [{ month: '2026-09', kwh: 1100 }],
    } satisfies BillFields;
    const next = applyBillToDraft(draftWith({ name: 'Casey Nguyen' }), bill);
    expect(next.name).toBe('Casey Nguyen');
    expect(next.kwh).toBe('1100');
    expect(next.accountNumber).toBe('100200300');
    expect(next.usageHistory?.length).toBeGreaterThan(0);
  });

  it('rejects a short ESI ID and archives without deleting identity fields', () => {
    expect(validateDraft(draftWith({ esiid: '12345' }))).toMatch(/ESI ID/);
    expect(buildArchivePatch(actor, now)).toEqual({
      archived_at: '2026-10-25T15:00:00.000Z',
      archived_by: actor.id,
      updated_at: '2026-10-25T15:00:00.000Z',
    });
    expect(buildRestorePatch(now).archived_at).toBeNull();
  });

  it('stores a light bill beside the customer, not in a public path', () => {
    const built = buildLightBillFile({
      customerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      actor,
      fileName: 'My Bill.PDF',
      mimeType: 'application/pdf',
      sizeBytes: 1200,
      now,
      fileId: 'file123',
    });
    expect('path' in built).toBe(true);
    if (!('path' in built)) return;
    expect(built.path).toBe('customers/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/light_bill/file123-My-Bill.PDF');
    expect(built.row.category).toBe('light_bill');
    expect(built.row.uploaded_by).toBe(actor.id);
  });

  it('notices a database that has not added the archive columns', () => {
    expect(isMissingArchiveColumn({ code: '42703', message: 'column powergenie_customers.archived_at does not exist' })).toBe(true);
    expect(isMissingArchiveColumn({ code: '42501', message: 'permission denied' })).toBe(false);
  });
});
