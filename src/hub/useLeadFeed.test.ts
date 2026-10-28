import { describe, expect, it } from 'vitest';
import { leadsForView, toLeads, unseenActiveCount, type Lead } from './useLeadFeed';

const gmailNotes = 'Gmail message 18abcdef123\nForwarded light bill';

describe('lead feed merge', () => {
  it('keeps customer rows and booking rows, and hides archived leads from the active view', () => {
    const leads = toLeads(
      [
        {
          id: 'gmail-1',
          created_at: '2026-10-24T04:21:31.659Z',
          customer_name: 'Inbox Lead',
          service_address: '1 Grid Street',
          phone: '713-555-0100',
          email: 'inbox@example.com',
          notes: gmailNotes,
          kwh_this_period: 900,
          total_due: 140,
          current_charges: 140,
          past_due: 0,
          account_number: 'ACC-100',
          appointment_date: null,
          esiid: '10443720000000001',
          meter_number: 'M1',
          tdu: 'CenterPoint Energy',
          rep_puct_certificate: null,
          avg_monthly_kwh: 800,
          usage_history: [{ month: '2026-09', kwh: 900 }],
          utility: 'Entergy Texas',
          stage: 'bill_received',
          created_by: null,
          days: 31,
          avg_kwh_per_day: 29,
          kwh_same_month_last_year: null,
          bill_date: '2026-09-20',
          rate_plan: null,
          archived_at: null,
          archived_by: null,
        },
        {
          id: 'manual-1',
          created_at: '2026-10-25T15:00:00.000Z',
          customer_name: 'Casey Nguyen',
          service_address: '18 Maple Street',
          phone: null,
          email: null,
          notes: 'Manual lead from the Referral Hub',
          kwh_this_period: null,
          total_due: null,
          current_charges: null,
          past_due: null,
          account_number: null,
          appointment_date: null,
          esiid: null,
          meter_number: null,
          tdu: null,
          rep_puct_certificate: null,
          avg_monthly_kwh: null,
          usage_history: null,
          utility: 'Not provided',
          stage: 'bill_received',
          created_by: 'manual:11111111-1111-4111-8111-111111111111',
          days: null,
          avg_kwh_per_day: null,
          kwh_same_month_last_year: null,
          bill_date: null,
          rate_plan: null,
          archived_at: '2026-10-25T16:00:00.000Z',
          archived_by: '11111111-1111-4111-8111-111111111111',
        },
      ],
      [
        {
          id: 'bill-1',
          customer_id: 'gmail-1',
          category: 'light_bill',
          storage_path: 'customers/gmail-1/light_bill/bill.pdf',
          file_name: 'bill.pdf',
          created_at: '2026-10-24T04:22:00.000Z',
        },
      ],
      [
        {
          id: 'book-1',
          created_at: '2026-10-25T18:00:00.000Z',
          starts_at: '2026-10-26T15:00:00.000Z',
          status: 'booked',
          source: 'public',
          customer_name: 'Booking Guest',
          phone: '713-555-0199',
          email: null,
          address: '2 Oak',
          kwh: 400,
          bill_amount: 80,
          esiid: null,
          meter_number: null,
          tdu: null,
          rep_puct_certificate: null,
          avg_monthly_kwh: null,
          usage_history: null,
          hub_appointment_files: [],
        },
      ],
      [],
    );

    expect(leads.map((lead) => lead.id)).toEqual(['book-1', 'manual-1', 'gmail-1']);
    expect(leads.find((lead) => lead.id === 'gmail-1')).toMatchObject({
      source: 'customer',
      sourceLabel: 'Customer file',
      notes: gmailNotes,
      usageHistory: [{ month: '2026-09', kwh: 900 }],
      bill: { bucket: 'powergenie', path: 'customers/gmail-1/light_bill/bill.pdf', name: 'bill.pdf' },
      archived: false,
      amount: 140,
    });
    expect(leads.find((lead) => lead.id === 'manual-1')?.sourceLabel).toBe('Manual entry');
    const [brandLead] = toLeads(
      [{
        id: 'brand-1',
        created_at: '2026-10-28T12:00:00Z',
        customer_name: 'Sport Fan',
        service_address: '123 Main St',
        phone: '555-111-2222',
        email: 'fan@example.com',
        notes: 'Referral source: sport-and-solar\nPicked: Football tickets',
        kwh_this_period: null,
        total_due: null,
        current_charges: null,
        past_due: null,
        account_number: null,
        appointment_date: null,
        esiid: null,
        meter_number: null,
        tdu: null,
        rep_puct_certificate: null,
        avg_monthly_kwh: null,
        usage_history: null,
        utility: null,
        stage: 'bill_received',
        created_by: null,
        days: null,
        avg_kwh_per_day: null,
        kwh_same_month_last_year: null,
        bill_date: null,
        rate_plan: null,
        archived_at: null,
        archived_by: null
      }],
      [],
      [],
      []
    );
    expect(brandLead.sourceLabel).toBe('Sport & Solar');
    expect(leads.find((lead) => lead.id === 'book-1')).toMatchObject({
      source: 'booking',
      sourceLabel: 'Booking page',
      archived: false,
      kwh: 400,
    });

    const active = leadsForView(leads, 'active');
    expect(active.map((lead) => lead.id)).toEqual(['book-1', 'gmail-1']);
    expect(leadsForView(leads, 'archived').map((lead) => lead.id)).toEqual(['manual-1']);
    const unseenLead = { unseen: true, archived: true } as Lead;
    expect(unseenActiveCount([unseenLead, { ...unseenLead, archived: false }])).toBe(1);
  });
});
