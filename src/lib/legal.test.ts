import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_OPENAI_SENTENCE,
  BOOKING_FIELDS_SENTENCE,
  DELETION_SENTENCE,
  GOOGLE_CALENDAR_USE,
  GOOGLE_LIMITED_USE,
  GOOGLE_NOT_SOLD,
  NO_SAVINGS_GUARANTEE,
  SMT_CONSENT_SENTENCE,
  SUNRUN_SEPARATE,
} from './legal';

describe('privacy and terms copy', () => {
  it('covers booking, the meter, the assistant, and Google Limited Use', () => {
    expect(BOOKING_FIELDS_SENTENCE).toContain('name, phone, email, address, notes');
    expect(BOOKING_FIELDS_SENTENCE).toContain('uploaded light bill');
    expect(SMT_CONSENT_SENTENCE).toContain('only with the customer’s consent');
    expect(ASSISTANT_OPENAI_SENTENCE).toContain('processed by OpenAI');
    expect(GOOGLE_CALENDAR_USE).toContain('calendar.events');
    expect(GOOGLE_CALENDAR_USE).toContain('calendar.freebusy');
    expect(GOOGLE_CALENDAR_USE).toContain('create/update appointment events');
    expect(GOOGLE_NOT_SOLD).toContain('not sold');
    expect(GOOGLE_NOT_SOLD).toContain('not used for ads');
    expect(GOOGLE_LIMITED_USE).toContain('Google API Services User Data Policy');
    expect(GOOGLE_LIMITED_USE).toContain('Limited Use requirements');
    expect(DELETION_SENTENCE).toContain('roryulloa@gmail.com');
  });

  it('states the referral limits in plain language', () => {
    expect(NO_SAVINGS_GUARANTEE).toContain('no guarantee of solar savings');
    expect(SUNRUN_SEPARATE).toBe('Sunrun is a separate company from The Power Genie.');
  });
});
