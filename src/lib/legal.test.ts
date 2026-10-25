import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_OPENAI_SENTENCE,
  BOOKING_FIELDS_SENTENCE,
  BOOKING_REQUEST_SENTENCE,
  COLLECTED_INFORMATION_SENTENCE,
  CONTACT_PHONE_DISPLAY,
  DELETION_SENTENCE,
  GOOGLE_CALENDAR_USE,
  GOOGLE_LIMITED_USE,
  GOOGLE_NOT_SOLD,
  INFORMATION_USE_SENTENCE,
  NO_SAVINGS_GUARANTEE,
  OPERATOR_SENTENCE,
  SECURITY_SENTENCE,
  SMS_CARRIER_LIABILITY,
  SMS_FREQUENCY,
  SMS_NO_SHARE_SENTENCE,
  SMS_OPT_OUT_SENTENCE,
  SMS_PROGRAM_DESCRIPTION,
  SMS_PROGRAM_NAME,
  SMS_RATES,
  SMS_STOP_HELP,
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
    expect(GOOGLE_CALENDAR_USE).toContain('show availability');
    expect(GOOGLE_CALENDAR_USE).toContain('create/update appointment events');
    expect(GOOGLE_NOT_SOLD).toContain('not sold');
    expect(GOOGLE_NOT_SOLD).toContain('not used for ads');
    expect(GOOGLE_LIMITED_USE).toContain('Google API Services User Data Policy');
    expect(GOOGLE_LIMITED_USE).toContain('Limited Use requirements');
    expect(DELETION_SENTENCE).toContain('roryulloa@gmail.com');
  });

  it('states the referral limits in plain language', () => {
    expect(BOOKING_REQUEST_SENTENCE).toBe('Booking is a request for a call.');
    expect(NO_SAVINGS_GUARANTEE).toContain('no guarantee of solar savings');
    expect(SUNRUN_SEPARATE).toBe('Sunrun is a separate company from The Power Genie.');
  });

  it('states the A2P privacy and text-message terms reviewers look for', () => {
    expect(OPERATOR_SENTENCE).toContain('Rory Ulloa');
    expect(OPERATOR_SENTENCE).toContain('Houston, Texas');
    expect(OPERATOR_SENTENCE).toContain('partnership with Sunrun');
    expect(COLLECTED_INFORMATION_SENTENCE).toContain('name, phone, email, address');
    expect(COLLECTED_INFORMATION_SENTENCE).toContain('uploaded electric bills and usage data');
    expect(COLLECTED_INFORMATION_SENTENCE).toContain('booking details');
    expect(INFORMATION_USE_SENTENCE).toContain('schedule your savings consult');
    expect(INFORMATION_USE_SENTENCE).toContain('savings estimate');
    expect(INFORMATION_USE_SENTENCE).toContain('Sunrun representative handling your consult');
    expect(SECURITY_SENTENCE).toContain('HTTPS');
    expect(SMS_NO_SHARE_SENTENCE).toBe(
      'No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Text messaging originator opt-in data and consent will not be shared with any third parties.',
    );
    expect(SMS_PROGRAM_NAME).toBe('Power Genie Alerts');
    expect(SMS_PROGRAM_DESCRIPTION).toContain('account login links');
    expect(SMS_PROGRAM_DESCRIPTION).toContain('new-lead/appointment alerts');
    expect(SMS_PROGRAM_DESCRIPTION).toContain('team members');
    expect(SMS_FREQUENCY).toContain('Message frequency varies');
    expect(SMS_RATES).toContain('Message and data rates may apply');
    expect(SMS_STOP_HELP).toBe('Reply STOP to cancel, HELP for help.');
    expect(SMS_OPT_OUT_SENTENCE).toContain('Reply STOP');
    expect(SMS_CARRIER_LIABILITY).toContain('not liable for delayed or undelivered messages');
    expect(CONTACT_PHONE_DISPLAY).toBe('281-323-0450');
  });
});
