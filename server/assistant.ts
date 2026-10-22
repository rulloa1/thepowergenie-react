import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ASSISTANT_DEFAULT_MODEL,
  ASSISTANT_SYSTEM_PROMPT,
  cleanHistory,
  listOpenSlotsForAssistant,
  prepareBookTool,
} from '../src/lib/assistantPolicy';
import { toPublicBookBody, type BillUploadGrant } from '../src/lib/lightBill';
import type { SmtStatus } from '../src/lib/smt';
import { bookSlot, listOpenSlots } from './booking';
import type { ServerEnv } from './env';

export function assistantEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function assistantModel(): string {
  return process.env.OPENAI_MODEL?.trim() || ASSISTANT_DEFAULT_MODEL;
}

type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

type PublicBooking = {
  startsAt: string;
  endsAt: string;
  upload: BillUploadGrant | null;
  billClaim: string | null;
  meterStatus: SmtStatus | null;
};

const tools = [
  {
    type: 'function',
    function: {
      name: 'list_open_slots',
      description: 'List open one-hour times for a call with Horace. Returns start times only, never other customers.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_slot',
      description: 'Book one open slot after the customer gives name, phone, email, and address. Meter fields are optional.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          slot: { type: 'string' },
          name: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          address: { type: 'string' },
          note: { type: 'string' },
          meter: {
            type: 'object',
            additionalProperties: false,
            properties: {
              esiId: { type: 'string' },
              meterNumber: { type: 'string' },
              email: { type: 'string' },
              consent: { type: 'boolean' },
            },
          },
        },
        required: ['slot', 'name', 'phone', 'email', 'address'],
      },
    },
  },
];

export async function runAssistant(
  admin: SupabaseClient,
  env: ServerEnv,
  input: unknown,
): Promise<{ ok: true; message: string; booking: PublicBooking | null } | { ok: false; status: number; message: string }> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return { ok: false, status: 404, message: 'The assistant is not turned on.' };
  const history = cleanHistory(input);
  if (!history.ok) return { ok: false, status: 400, message: history.message };

  const conversation: Array<Record<string, unknown>> = [
    { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
    ...history.messages,
  ];
  let booking: PublicBooking | null = null;

  try {
    for (let round = 0; round < 3; round += 1) {
      const message = await complete(key, conversation);
      const calls = message.tool_calls ?? [];
      if (calls.length === 0) {
        return { ok: true, message: textOf(message.content), booking };
      }
      conversation.push({
        role: 'assistant',
        content: message.content ?? '',
        tool_calls: calls,
      });
      for (const call of calls) {
        const outcome = await runTool(admin, env, call, (value) => {
          booking = value;
        });
        conversation.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(outcome),
        });
      }
    }
  } catch (error) {
    console.error('assistant failed', error instanceof Error ? error.name : 'error');
    return { ok: false, status: 502, message: 'The assistant is busy. You can still book with the form.' };
  }
  return {
    ok: true,
    message: 'I can help with solar questions and open times. Ask again, or use the form.',
    booking,
  };
}

async function runTool(
  admin: SupabaseClient,
  env: ServerEnv,
  call: ToolCall,
  saveBooking: (booking: PublicBooking) => void,
): Promise<unknown> {
  const args = parseArgs(call.function.arguments);
  if (call.function.name === 'list_open_slots') {
    const slots = await listOpenSlots(admin, env);
    const labels = new Map(listOpenSlotsForAssistant(new Date()).map((slot) => [slot.start, slot.label]));
    return {
      slots: slots.slice(0, 40).map((start) => ({
        start,
        label: labels.get(start) ?? start,
      })),
    };
  }
  if (call.function.name === 'book_slot') {
    const prepared = prepareBookTool(args, new Date());
    if (!prepared.ok) return { error: prepared.message };
    const booked = await bookSlot(admin, env, {
      slot: prepared.value.slot,
      customer: prepared.value.customer,
      meter: prepared.value.meter,
      source: 'public',
      createdBy: null,
    });
    if (!booked.ok) return { error: booked.error };
    const upload = toPublicBookBody(booked).upload ?? null;
    saveBooking({
      startsAt: booked.startsAt,
      endsAt: booked.endsAt,
      upload,
      billClaim: booked.billClaim,
      meterStatus: booked.meterStatus,
    });
    return {
      booked: true,
      startsAt: booked.startsAt,
      endsAt: booked.endsAt,
      meterStatus: booked.meterStatus,
      lightBillUpload: Boolean(upload) || Boolean(booked.billClaim),
    };
  }
  return { error: 'That action is not available.' };
}

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

function textOf(content: string | null): string {
  const text = (content ?? '').trim();
  return text || 'Horace will confirm the details on the call. You can also use the form below.';
}

async function complete(key: string, messages: Array<Record<string, unknown>>): Promise<{
  content: string | null;
  tool_calls?: ToolCall[];
}> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: assistantModel(),
      temperature: 0.3,
      max_tokens: 500,
      messages,
      tools,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    console.error('openai request failed', response.status);
    throw new Error('openai');
  }
  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
  };
  const message = json.choices?.[0]?.message;
  return {
    content: message?.content ?? null,
    tool_calls: message?.tool_calls,
  };
}
