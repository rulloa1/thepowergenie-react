import { describe, expect, it } from 'vitest';
import type { CustomerDetails } from './bookingForm';
import {
  LIGHT_BILL_MAX_BYTES,
  acceptStoredBillMime,
  calendarEventDescription,
  isBillDownloadUrl,
  isLightBillObjectPath,
  isSignedUploadUrl,
  lightBillCalendarNote,
  lightBillStoragePath,
  toPublicBookBody,
  validateLightBill,
} from './lightBill';

const customer: CustomerDetails = {
  name: 'Jamie Lee',
  phone: '(713) 555-0100',
  email: 'jamie@example.com',
  address: '1200 Smith St, Houston, TX',
  note: 'Gate code 1234',
};

const appointmentId = '11111111-1111-4111-8111-111111111111';
const objectId = '22222222-2222-4222-8222-222222222222';
const confirmToken = 'ab'.repeat(32);
const uploadUrl = 'https://powergenie.supabase.co/storage/v1/object/upload/sign/light-bills/bills/22222222-2222-4222-8222-222222222222-october.pdf?token=upload-token';

describe('validateLightBill', () => {
  it('accepts pdf, jpg, png, heic, and other phone photo types', () => {
    const accepted = [
      { name: 'october.pdf', type: 'application/pdf' },
      { name: 'bill.JPG', type: 'image/jpeg' },
      { name: 'photo.jpeg', type: 'image/jpg' },
      { name: 'scan.png', type: 'image/png' },
      { name: 'IMG_2201.HEIC', type: 'image/heic' },
      { name: 'shot.heif', type: '' },
      { name: 'camera.webp', type: 'image/webp' },
      { name: 'old.gif', type: 'image/gif' },
      { name: 'scan.tiff', type: 'image/tiff' },
      { name: 'phone.jfif', type: 'application/octet-stream' },
    ];
    for (const file of accepted) {
      const result = validateLightBill({ ...file, size: 2048 });
      expect(result.ok, file.name).toBe(true);
    }
  });

  it('rejects an empty file, a file over 10 MB, and a file that is not a bill', () => {
    expect(validateLightBill({ name: 'bill.pdf', type: 'application/pdf', size: 0 }).ok).toBe(false);
    expect(validateLightBill({ name: 'bill.pdf', type: 'application/pdf', size: LIGHT_BILL_MAX_BYTES }).ok).toBe(true);
    expect(validateLightBill({ name: 'bill.pdf', type: 'application/pdf', size: LIGHT_BILL_MAX_BYTES + 1 }).ok).toBe(false);
    expect(validateLightBill({ name: 'bill.exe', type: 'application/octet-stream', size: 20 }).ok).toBe(false);
    expect(validateLightBill({ name: 'bill.svg', type: 'image/svg+xml', size: 20 }).ok).toBe(false);
    expect(validateLightBill({ name: 'bill.html', type: 'text/html', size: 20 }).ok).toBe(false);
    expect(validateLightBill({ name: 'notes.txt', type: 'text/plain', size: 20 }).ok).toBe(false);
    expect(validateLightBill({ name: '', type: 'application/pdf', size: 20 }).ok).toBe(false);
    expect(validateLightBill(null).ok).toBe(false);
  });

  it('rejects a mime type that disagrees with the file extension', () => {
    expect(validateLightBill({ name: 'bill.png', type: 'application/pdf', size: 20 }).ok).toBe(false);
    expect(validateLightBill({ name: 'bill.exe', type: 'application/pdf', size: 20 }).ok).toBe(false);
  });

  it('stores a file name that cannot leave the appointment folder', () => {
    const result = validateLightBill({ name: '../secret/october bill.pdf', type: 'application/pdf', size: 20 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe('october_bill.pdf');
  });
});

describe('light bill object path', () => {
  it('keeps the object in the bills folder and drops directory tricks', () => {
    const path = lightBillStoragePath('../../secret.pdf', objectId);
    expect(path).toBe(`bills/${objectId}-secret.pdf`);
    expect(path && isLightBillObjectPath(path)).toBe(true);
    expect(isLightBillObjectPath(`bills/${objectId}/../../other.pdf`)).toBe(false);
    expect(lightBillStoragePath('bill.pdf', 'not-an-id')).toBeNull();
    expect(path).not.toContain(appointmentId);
  });
});

describe('stored object mime', () => {
  it('allows a phone photo and rejects html or svg', () => {
    expect(acceptStoredBillMime('image/heic')).toBe(true);
    expect(acceptStoredBillMime('application/octet-stream')).toBe(true);
    expect(acceptStoredBillMime(null)).toBe(true);
    expect(acceptStoredBillMime('text/html')).toBe(false);
    expect(acceptStoredBillMime('image/svg+xml')).toBe(false);
  });
});

describe('calendar event copy', () => {
  it('points at the dashboard and does not include a file URL', () => {
    const note = lightBillCalendarNote('https://evil.supabase.co/storage/v1/object/public/light-bills/secret.pdf?token=abc');
    expect(note).toContain('https://evil.supabase.co/dashboard');
    expect(note).not.toContain('/object/');
    expect(note).not.toContain('secret.pdf');
    expect(note).not.toContain('token=');

    const description = calendarEventDescription({
      customer,
      lightBillAttached: true,
      site: 'https://thepowergenie.theroyeffect.com',
    });
    expect(description).toContain("Last month's light bill is on the Power Genie dashboard.");
    expect(description).toContain('https://thepowergenie.theroyeffect.com/dashboard');
    expect(description).toContain('The file is not attached to this event.');
    expect(description).toContain('Gate code 1234');
    expect(description.toLowerCase()).not.toContain('supabase');
    expect(description).not.toContain('/object/');
    expect(description).not.toContain('light-bills');
    expect(description).not.toContain('token=');
  });

  it('leaves the bill sentence off when no bill was attached', () => {
    const description = calendarEventDescription({
      customer: { ...customer, note: null },
      lightBillAttached: false,
      site: null,
    });
    expect(description).not.toContain('light bill');
    expect(description).toContain('Booked on thepowergenie.theroyeffect.com');
    expect(description).not.toContain('Note:');
  });

  it('falls back to the public site when the dashboard address is not a normal web origin', () => {
    const note = lightBillCalendarNote('javascript:alert(1)');
    expect(note).toContain('https://thepowergenie.theroyeffect.com/dashboard');
  });
});

describe('public booking response', () => {
  it('returns the upload grant and no appointment id or file path', () => {
    const body = toPublicBookBody({
      startsAt: '2026-10-28T14:00:00.000Z',
      endsAt: '2026-10-28T15:00:00.000Z',
      upload: { signedUrl: uploadUrl, confirmToken },
    });
    expect(Object.keys(body).sort()).toEqual(['endsAt', 'ok', 'startsAt', 'upload']);
    expect(body.upload && Object.keys(body.upload).sort()).toEqual(['confirmToken', 'signedUrl']);
    expect(JSON.stringify(body)).not.toContain(appointmentId);
  });

  it('drops an upload grant that is not a signed light-bill upload', () => {
    const body = toPublicBookBody({
      startsAt: '2026-10-28T14:00:00.000Z',
      endsAt: '2026-10-28T15:00:00.000Z',
      upload: {
        signedUrl: 'https://evil.example/storage/v1/object/public/light-bills/secret.pdf?token=abc',
        confirmToken,
      },
    });
    expect(body.upload).toBeUndefined();
  });
});

describe('signed URLs', () => {
  it('accepts an upload URL for the private bucket and a matching project host', () => {
    expect(isSignedUploadUrl(uploadUrl, 'https://powergenie.supabase.co')).toBe(true);
    expect(isSignedUploadUrl(uploadUrl, 'https://other.supabase.co')).toBe(false);
    expect(isSignedUploadUrl('https://powergenie.supabase.co/storage/v1/object/public/light-bills/a.pdf?token=abc')).toBe(false);
    expect(isSignedUploadUrl('http://evil.example/storage/v1/object/upload/sign/light-bills/a.pdf?token=abc')).toBe(false);
  });

  it('accepts a short-lived download URL only on the project host', () => {
    const download = 'https://powergenie.supabase.co/storage/v1/object/sign/light-bills/appointments/a.pdf?token=abc';
    expect(isBillDownloadUrl(download, 'https://powergenie.supabase.co')).toBe(true);
    expect(isBillDownloadUrl(download, 'https://other.supabase.co')).toBe(false);
    expect(isBillDownloadUrl(uploadUrl, 'https://powergenie.supabase.co')).toBe(false);
    expect(isBillDownloadUrl(
      'https://powergenie.supabase.co/storage/v1/object/public/light-bills/a.pdf',
      'https://powergenie.supabase.co',
    )).toBe(false);
  });
});
