import { describe, expect, it } from 'vitest';
import { validateCustomer } from './bookingForm';

const valid = {
  name: 'Jamie Lee',
  phone: '(713) 555-0100',
  email: 'jamie@example.com',
  address: '1200 Smith St, Houston, TX',
  note: 'Gate code 1234',
};

describe('validateCustomer', () => {
  it('accepts a complete booking', () => {
    const result = validateCustomer(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.note).toBe('Gate code 1234');
      expect(result.value.phone).toBe('(713) 555-0100');
    }
  });

  it('treats a blank note as empty', () => {
    const result = validateCustomer({ ...valid, note: '   ' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.note).toBeNull();
  });

  it('rejects a short name, a short phone, a bad email, and a short address', () => {
    expect(validateCustomer({ ...valid, name: 'J' }).ok).toBe(false);
    expect(validateCustomer({ ...valid, phone: '555' }).ok).toBe(false);
    expect(validateCustomer({ ...valid, email: 'not-an-email' }).ok).toBe(false);
    expect(validateCustomer({ ...valid, address: '1 St' }).ok).toBe(false);
  });
});
