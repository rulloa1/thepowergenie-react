import { validateCustomer } from './bookingForm';
import { readMeterRequest, type MeterRequest } from './esiId';
import {
  formatChicagoDay,
  formatChicagoTime,
  generateOpenSlots,
  type BusyRange,
} from './slots';

export const ASSISTANT_MAX_CHARS = 1000;
export const ASSISTANT_MAX_TURNS = 8;
export const ASSISTANT_DEFAULT_MODEL = 'gpt-4.1-mini';

export const ASSISTANT_SYSTEM_PROMPT = [
  'You are the booking assistant for The Power Genie, Horace Lawrence\'s Sunrun solar page.',
  'Answer general questions about going solar with Sunrun and The Power Genie.',
  'Answers are not a quote and not a contract. Do not guarantee a price, a savings amount, an incentive, or a lower bill.',
  'When details depend on the home, say Horace will confirm them on the call.',
  'Book a call only by calling the tools. Offer only slot times the list_open_slots tool returns.',
  'Collect the customer\'s name, phone, email, address, and an optional note before book_slot.',
  'After a booking, tell them they can upload last month\'s light bill with the upload box, and that connecting their meter is optional.',
  'If they want to connect a meter, collect the ESI ID, the meter number, and a clear yes before you set meter.consent to true. Never set consent unless they agreed to share usage with The Power Genie through Smart Meter Texas.',
  'Never reveal other appointments, other customers, or any data the tools did not return for this person.',
  'If someone asks about another person\'s booking or usage, refuse.',
  'Do not invent prices, file links, or confirmation numbers.',
].join(' ');

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export function cleanHistory(input: unknown): { ok: true; messages: ChatTurn[] } | { ok: false; message: string } {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, message: 'Type a question to start.' };
  }
  const messages: ChatTurn[] = [];
  for (const item of input.slice(-ASSISTANT_MAX_TURNS)) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { role?: unknown; content?: unknown };
    if (record.role !== 'user' && record.role !== 'assistant') continue;
    if (typeof record.content !== 'string') continue;
    const content = record.content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
    if (!content) continue;
    if (content.length > ASSISTANT_MAX_CHARS) {
      return { ok: false, message: `Keep each message under ${ASSISTANT_MAX_CHARS} characters.` };
    }
    messages.push({ role: record.role, content });
  }
  if (!messages.some((message) => message.role === 'user')) {
    return { ok: false, message: 'Type a question to start.' };
  }
  return { ok: true, messages };
}

export type OpenSlotChoice = { start: string; label: string };

export function listOpenSlotsForAssistant(now: Date, busy: BusyRange[] = []): OpenSlotChoice[] {
  return generateOpenSlots({ now, busy }).slice(0, 40).map((start) => ({
    start: start.toISOString(),
    label: `${formatChicagoDay(start)} at ${formatChicagoTime(start)} Central`,
  }));
}

export function slotIsBookable(slotIso: string, now: Date, busy: BusyRange[] = []): boolean {
  const starts = new Date(slotIso);
  if (Number.isNaN(starts.getTime())) return false;
  return generateOpenSlots({ now, busy }).some((slot) => slot.getTime() === starts.getTime());
}

export type PreparedBooking = {
  slot: string;
  customer: { name: string; phone: string; email: string; address: string; note: string };
  meter: MeterRequest | null;
};

export function prepareBookTool(
  args: unknown,
  now: Date,
  busy: BusyRange[] = [],
): { ok: true; value: PreparedBooking } | { ok: false; message: string } {
  if (!args || typeof args !== 'object') return { ok: false, message: 'Pick an open time first.' };
  const record = args as Record<string, unknown>;
  const slot = typeof record.slot === 'string' ? record.slot : '';
  if (!slotIsBookable(slot, now, busy)) {
    return { ok: false, message: 'That time is not open. Ask for the open times and pick one of those.' };
  }
  const customer = validateCustomer(record);
  if (!customer.ok) return customer;
  const meter = readMeterRequest(record.meter, customer.value.email);
  if (!meter.ok) return meter;
  return {
    ok: true,
    value: {
      slot,
      customer: {
        name: customer.value.name,
        phone: customer.value.phone,
        email: customer.value.email,
        address: customer.value.address,
        note: customer.value.note ?? '',
      },
      meter: meter.value,
    },
  };
}
