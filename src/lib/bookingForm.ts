export type CustomerDetails = {
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string | null;
};

export type CustomerResult =
  | { ok: true; value: CustomerDetails }
  | { ok: false; message: string };

function clean(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

export function validateCustomer(input: unknown): CustomerResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, message: 'Enter the contact details to book.' };
  }
  const record = input as Record<string, unknown>;
  const name = clean(record.name, 120);
  const phone = clean(record.phone, 40);
  const email = clean(record.email, 200);
  const address = clean(record.address, 500);
  const note = clean(record.note, 2000);

  if (name.length < 2) return { ok: false, message: 'Enter a name.' };
  if (phone.replace(/\D/g, '').length < 7) return { ok: false, message: 'Enter a phone number.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: 'Enter a valid email.' };
  if (address.length < 5) return { ok: false, message: 'Enter the property address.' };

  return {
    ok: true,
    value: {
      name,
      phone,
      email,
      address,
      note: note.length > 0 ? note : null,
    },
  };
}
