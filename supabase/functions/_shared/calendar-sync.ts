// Pure calendar fan-out. No Deno or Node APIs, so the edge functions and the
// website assistant share one create/update/delete path.
//
// Availability: the owner's calendar (Horace) plus any connected member with
// requiredForAvailability. Nothing else in the hub marks a member as required.

/** Same zone as SLOT_TIME_ZONE in slots.ts. Inlined so this file imports nothing. */
const CONSULT_TIME_ZONE = 'America/Chicago';

export type ConsultSource = 'public' | 'dashboard' | 'assistant';

export type ConsultDetails = {
  id: string;
  start: string;
  end: string;
  customerName: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  note?: string | null;
  dashboardUrl: string;
  source: ConsultSource;
  hasLightBill?: boolean;
};

export type StoredCalendarEvent = {
  userId: string;
  googleEventId: string | null;
  syncError: string | null;
};

export type MemberSyncResult = {
  userId: string;
  googleEventId: string | null;
  syncError: string | null;
};

export type RemovalResult = {
  userId: string;
  error: string | null;
};

export function isMissingCalendarEvent(error: unknown): boolean {
  const status = error && typeof error === 'object' && 'status' in error ? Number((error as { status: unknown }).status) : 0;
  return status === 404 || status === 410;
}

export function syncErrorMessage(error: unknown): string {
  const message = error instanceof Error && error.message ? error.message : 'Google Calendar sync failed';
  return message.replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** One line for hub_appointments.google_sync_error. Null when every member succeeded. */
export function syncSummary(results: MemberSyncResult[]): string | null {
  const failed = results.filter((result) => result.syncError);
  if (!failed.length) return null;
  const detail = failed[0].syncError || 'Google Calendar sync failed';
  if (failed.length === results.length) return detail.slice(0, 500);
  return `${failed.length} of ${results.length} calendars failed. ${detail}`.slice(0, 500);
}

export function availabilityMembers<T extends { role: string | null; requiredForAvailability: boolean }>(members: T[]): T[] {
  return members.filter((member) => member.role === 'owner' || member.requiredForAvailability);
}

function blank(value: string | null | undefined): string {
  return (value || '').trim();
}

/** Google Calendar event body. Times are Central even when the ISO string is UTC. */
export function consultEventBody(details: ConsultDetails) {
  const phone = blank(details.phone);
  const email = blank(details.email);
  const address = blank(details.address);
  const note = blank(details.note);
  const intro =
    details.source === 'assistant'
      ? 'Booked by the website assistant.'
      : details.source === 'public'
        ? 'Booked online via The Power Genie booking page.'
        : 'Added from The Power Genie dashboard.';
  const lines = [
    intro,
    '',
    `Customer: ${details.customerName}`,
    phone ? `Phone: ${phone}` : '',
    email ? `Email: ${email}` : '',
    address ? `Address: ${address}` : '',
    note ? `Note: ${note}` : '',
    '',
    details.hasLightBill
      ? 'Light bill: uploaded. Open the lead below to view it. It is not attached here.'
      : 'Light bill: not uploaded.',
    'Open this lead in the Referral Hub:',
    details.dashboardUrl,
  ].filter((line, index, all) => line !== '' || (all[index - 1] ?? '') !== '');

  return {
    summary: `Power Genie consult: ${details.customerName}`,
    location: address || undefined,
    description: lines.join('\n'),
    start: { dateTime: details.start, timeZone: CONSULT_TIME_ZONE },
    end: { dateTime: details.end, timeZone: CONSULT_TIME_ZONE },
    reminders: { useDefault: true },
    extendedProperties: { private: { powerGenieAppointmentId: details.id } },
  };
}

/**
 * Create or update one event per connected member. A failure is recorded on
 * that member and does not stop the others. An event that was deleted on the
 * phone (404/410) is created again.
 */
export async function fanOutCalendars<T extends { userId: string }>(args: {
  members: T[];
  stored: StoredCalendarEvent[];
  createEvent: (member: T) => Promise<string>;
  updateEvent: (member: T, eventId: string) => Promise<void>;
}): Promise<MemberSyncResult[]> {
  const prior = new Map(args.stored.map((row) => [row.userId, row]));
  return Promise.all(args.members.map(async (member) => {
    const existing = prior.get(member.userId);
    try {
      if (existing?.googleEventId) {
        try {
          await args.updateEvent(member, existing.googleEventId);
          return { userId: member.userId, googleEventId: existing.googleEventId, syncError: null };
        } catch (error) {
          if (!isMissingCalendarEvent(error)) throw error;
        }
      }
      const googleEventId = await args.createEvent(member);
      return { userId: member.userId, googleEventId, syncError: null };
    } catch (error) {
      return {
        userId: member.userId,
        googleEventId: existing?.googleEventId ?? null,
        syncError: syncErrorMessage(error),
      };
    }
  }));
}

/** Delete every stored event. A missing member connection is reported, not thrown. */
export async function removeCalendars<T extends { userId: string }>(args: {
  members: T[];
  stored: StoredCalendarEvent[];
  deleteEvent: (member: T, eventId: string) => Promise<void>;
}): Promise<RemovalResult[]> {
  const byUser = new Map(args.members.map((member) => [member.userId, member]));
  const rows = args.stored.filter((row) => row.googleEventId);
  return Promise.all(rows.map(async (row) => {
    const member = byUser.get(row.userId);
    if (!member) {
      return { userId: row.userId, error: 'That member disconnected Google before the event could be removed.' };
    }
    try {
      await args.deleteEvent(member, row.googleEventId as string);
      return { userId: row.userId, error: null };
    } catch (error) {
      return { userId: row.userId, error: syncErrorMessage(error) };
    }
  }));
}
