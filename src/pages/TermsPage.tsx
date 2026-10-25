import { focusRing } from '../components/legalChrome';
import {
  BOOKING_REQUEST_SENTENCE,
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_TEL,
  NO_SAVINGS_GUARANTEE,
  SMS_CARRIER_LIABILITY,
  SMS_FREQUENCY,
  SMS_PROGRAM_DESCRIPTION,
  SMS_PROGRAM_NAME,
  SMS_RATES,
  SMS_STOP_HELP,
  SUNRUN_SEPARATE,
} from '../lib/legal';
import LegalDocument, { LegalSection } from './LegalDocument';

const linkClass = `font-semibold text-[#0066CC] no-underline hover:underline ${focusRing}`;

export default function TermsPage() {
  return (
    <LegalDocument title="Terms & Conditions">
      <LegalSection heading="What this site is">
        <p className="m-0">
          The Power Genie offers Houston solar referrals and a way to book a call. These terms
          cover using this website, asking for a referral, booking that call, and the{' '}
          {SMS_PROGRAM_NAME} text program.
        </p>
      </LegalSection>

      <LegalSection id="sms" heading="Text messages — Power Genie Alerts">
        <p className="m-0">Program name: {SMS_PROGRAM_NAME}.</p>
        <p className="m-0">{SMS_PROGRAM_DESCRIPTION}</p>
        <p className="m-0">{SMS_FREQUENCY}</p>
        <p className="m-0">{SMS_RATES}</p>
        <p className="m-0">{SMS_STOP_HELP}</p>
        <p className="m-0">{SMS_CARRIER_LIABILITY}</p>
        <p className="m-0">
          Consent to receive these texts is not a condition of purchase. {SMS_PROGRAM_NAME} is for
          account login links and new-lead/appointment alerts for Rory Ulloa’s team members who
          opt in.
        </p>
        <p className="m-0">
          Contact{' '}
          <a className={linkClass} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          {' or '}
          <a className={linkClass} href={`tel:${CONTACT_PHONE_TEL}`}>{CONTACT_PHONE_DISPLAY}</a>.
        </p>
        <p className="m-0">
          <a className={linkClass} href="/privacy">Privacy Policy</a>
        </p>
      </LegalSection>

      <LegalSection heading="A booking is a request for a call">
        <p className="m-0">{BOOKING_REQUEST_SENTENCE}</p>
        <p className="m-0">
          It is not a contract to buy solar panels, a battery, or any other product, and it does
          not lock in a price, a payment plan, or an installation date. A time is confirmed only
          when this site says the booking went through.
        </p>
      </LegalSection>

      <LegalSection heading="Sunrun">
        <p className="m-0">{SUNRUN_SEPARATE}</p>
        <p className="m-0">
          The Power Genie refers customers to Sunrun. It does not install solar and it does not
          control Sunrun’s prices, credit decisions, warranties, or customer agreements. The quote
          form on this site may be hosted by Sunrun. Any agreement for equipment, installation, or
          financing is between you and Sunrun, or another company Sunrun names.
        </p>
      </LegalSection>

      <LegalSection heading="No guarantee of savings">
        <p className="m-0">{NO_SAVINGS_GUARANTEE}</p>
        <p className="m-0">
          Numbers you see on this site, in a chat, or from the booking assistant are not a promise.
          Horace or Sunrun has to confirm what applies to your home. The assistant can help you
          find an open time. It can be wrong, and it cannot guarantee savings.
        </p>
      </LegalSection>

      <LegalSection heading="Information you send">
        <p className="m-0">
          You agree that the name, phone, email, address, notes, and any light bill you submit are
          yours to share and are accurate enough for us to contact you. Sharing Smart Meter Texas
          usage is optional and happens only if you consent. Please don’t use the forms or the
          assistant to send someone else’s private information.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p className="m-0">
          Questions about these terms:{' '}
          <a className={linkClass} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          {' or '}
          <a className={linkClass} href={`tel:${CONTACT_PHONE_TEL}`}>{CONTACT_PHONE_DISPLAY}</a>.
          {' '}
          <a className={linkClass} href="/privacy">Privacy Policy</a>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
