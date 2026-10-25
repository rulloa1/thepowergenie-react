import { describe, expect, it } from 'vitest';
import {
  SMT_PATHS,
  agreementLookupBody,
  mapAgreementStatus,
  newAgreementBody,
  parseIntervalUsage,
  parseMonthlyUsage,
  responseIsAsyncAck,
  smtAuthorizationHeader,
  usageBody,
} from './smt';

const caller = { requestorId: 'powergenie', duns: '123456789' };
const meter = {
  esiId: '10032789400250865',
  meterNumber: '144054330',
  email: 'jamie@example.com',
  consent: true as const,
};

describe('SMT request bodies', () => {
  it('builds the published New Agreement request', () => {
    const body = newAgreementBody(caller, meter, 'abc123');
    expect(body.retailCustomerEmail).toBe('jamie@example.com');
    expect(body.customerMeterList).toEqual([{ ESIID: meter.esiId, meterNumber: meter.meterNumber }]);
    expect(body.agreementDuration).toBe(12);
    expect(body.SMTTermsandConditions).toBe('Y');
    expect(JSON.stringify(body)).not.toContain('tokenUrl');
  });

  it('uses the documented usage paths and CSP as the third-party type', () => {
    expect(SMT_PATHS.monthly).toBe('/monthlybillingInformation/');
    expect(SMT_PATHS.intervals).toBe('/15minintervalreads/');
    const body = usageBody({
      caller,
      esiId: meter.esiId,
      start: new Date('2026-01-01T12:00:00.000Z'),
      end: new Date('2026-10-22T12:00:00.000Z'),
      transId: 'usage1',
    });
    expect(body.requesterType).toBe('CSP');
    expect(body.reportFormat).toBe('JSON');
    expect(body.esiid).toEqual([meter.esiId]);
    expect(agreementLookupBody(caller, '119098', 'lookup1').agreementNumber).toBe(119098);
  });

  it('sends Basic auth unless a token from SMT was provided', () => {
    expect(smtAuthorizationHeader({ username: 'user', portalPassword: 'example', token: null })).toMatch(/^Basic /);
    expect(smtAuthorizationHeader({ username: 'user', portalPassword: 'example', token: 'example-token' })).toBe('Bearer example-token');
  });
});

describe('SMT responses', () => {
  it('reads monthly kWh from the synchronous billing example shape', () => {
    const rows = parseMonthlyUsage({
      esiid: meter.esiId,
      billingData: [
        { startDate: '04/25/2019', endDate: '05/24/2019', actualkWh: '683' },
        { startDate: 'bad', endDate: '05/24/2019', actualkWh: '10' },
      ],
    });
    expect(rows).toEqual([{ periodStart: '2019-04-25', periodEnd: '2019-05-24', kwh: 683 }]);
  });

  it('reads 15-minute readings and ignores blanks', () => {
    const rows = parseIntervalUsage({
      energyData: [{ DT: '01/20/2018', RD: '.085-A,,.118-E' }],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kwh: 0.085, quality: 'A', intervalStart: '2018-01-20T06:00:00.000Z' });
    expect(rows[1]).toMatchObject({ kwh: 0.118, quality: 'E' });
  });

  it('does not invent rows when SMT only acknowledges an email delivery', () => {
    const ack = {
      trans_id: '111',
      correlationId: '34553b76ad5911e9ac0c0a04',
      statusCode: '0000',
      statusReason: 'Request has been submitted successfully. The CSV report will be delivered through EML',
    };
    expect(responseIsAsyncAck(ack)).toBe(true);
    expect(parseMonthlyUsage(ack)).toEqual([]);
  });

  it('maps the guide status text onto our statuses', () => {
    expect(mapAgreementStatus('Pending - Customer Authorization')).toBe('requested');
    expect(mapAgreementStatus('Active')).toBe('approved');
    expect(mapAgreementStatus('Expired')).toBe('expired');
    expect(mapAgreementStatus('Terminated')).toBe('failed');
  });
});
