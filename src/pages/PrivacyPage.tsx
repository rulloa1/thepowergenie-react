import { focusRing } from '../components/legalChrome';
import {
  ASSISTANT_OPENAI_SENTENCE,
  BOOKING_FIELDS_SENTENCE,
  CALENDAR_EVENTS_SCOPE,
  CALENDAR_FREEBUSY_SCOPE,
  COLLECTED_INFORMATION_SENTENCE,
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_TEL,
  DELETION_SENTENCE,
  GOOGLE_CALENDAR_USE,
  GOOGLE_LIMITED_USE,
  GOOGLE_NOT_SOLD,
  GOOGLE_POLICY_URL,
  INFORMATION_USE_SENTENCE,
  OPERATOR_SENTENCE,
  SECURITY_SENTENCE,
  SMS_FREQUENCY,
  SMS_NO_SHARE_SENTENCE,
  SMS_OPT_OUT_SENTENCE,
  SMS_PROGRAM_DESCRIPTION,
  SMS_PROGRAM_NAME,
  SMT_CONSENT_SENTENCE,
} from '../lib/legal';
import LegalDocument, { LegalSection } from './LegalDocument';

const linkClass = `font-semibold text-[#0066CC] no-underline hover:underline ${focusRing}`;

export default function PrivacyPage() {
  return (
    <LegalDocument title="Privacy Policy">
      <LegalSection heading="Who we are">
        <p className="m-0">{OPERATOR_SENTENCE}</p>
        <p className="m-0">
          This policy describes the information collected on this website, on the booking page,
          and in the owner dashboard.
        </p>
      </LegalSection>

      <LegalSection heading="Information we collect">
        <p className="m-0">{COLLECTED_INFORMATION_SENTENCE}</p>
        <p className="m-0">{BOOKING_FIELDS_SENTENCE}</p>
        <p className="m-0">
          The light bill is optional. When you upload one, we store the file privately so the
          owner can open it from the dashboard before the call. It is not published on the website,
          and the calendar event does not include a public link to the file.
        </p>
      </LegalSection>

      <LegalSection heading="How we use information">
        <p className="m-0">{INFORMATION_USE_SENTENCE}</p>
        <p className="m-0">
          A phone number you give us to book a consult may be shared with that Sunrun representative
          so they can reach you about the appointment. We do not share it for marketing or promotional
          purposes.
        </p>
      </LegalSection>

      <LegalSection id="sms" heading="Text messaging">
        <p className="m-0">{SMS_PROGRAM_DESCRIPTION}</p>
        <p className="m-0">
          {SMS_PROGRAM_NAME} is sent only to team members who opt in. {SMS_FREQUENCY}{' '}
          {SMS_OPT_OUT_SENTENCE} Reply HELP for help, or contact{' '}
          <a className={linkClass} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          {' or '}
          <a className={linkClass} href={`tel:${CONTACT_PHONE_TEL}`}>{CONTACT_PHONE_DISPLAY}</a>.
        </p>
        <p className="m-0">{SMS_NO_SHARE_SENTENCE}</p>
      </LegalSection>

      <LegalSection heading="How we protect information">
        <p className="m-0">{SECURITY_SENTENCE}</p>
        <p className="m-0">
          No method of transmission or storage is perfectly secure. Please don’t send passwords
          through the booking forms or the chat.
        </p>
      </LegalSection>

      <LegalSection heading="Smart Meter Texas">
        <p className="m-0">{SMT_CONSENT_SENTENCE}</p>
        <p className="m-0">
          If you check the consent box, we send your ESI ID, meter number, and email to Smart Meter
          Texas so they can email you to approve access. After you approve, we store the usage
          readings they return and show them on the owner dashboard for that appointment. You can
          book a call without sharing a meter. Saying no does not cancel the appointment.
        </p>
      </LegalSection>

      <LegalSection heading="AI booking assistant">
        <p className="m-0">{ASSISTANT_OPENAI_SENTENCE}</p>
        <p className="m-0">
          Messages you type to the booking assistant are sent to OpenAI so it can reply and help
          you pick a time. Do not send passwords or anything you do not want a booking assistant
          to see. The assistant does not promise a price or savings. A separate website chat can
          also send the messages you type to an AI service so it can answer questions and help
          you request a consult.
        </p>
      </LegalSection>

      <LegalSection heading="Google user data">
        <p className="m-0">{GOOGLE_CALENDAR_USE}</p>
        <p className="m-0">
          Those scopes are{' '}
          <a className={linkClass} href={CALENDAR_EVENTS_SCOPE}>{CALENDAR_EVENTS_SCOPE}</a>
          {' '}and{' '}
          <a className={linkClass} href={CALENDAR_FREEBUSY_SCOPE}>{CALENDAR_FREEBUSY_SCOPE}</a>.
          Free/busy is used to hide times that are already taken. Events are created or updated
          only for appointments booked through this service. Other people’s calendar details are
          not shown on the public booking page.
        </p>
        <p className="m-0">{GOOGLE_NOT_SOLD}</p>
        <p className="m-0">
          {GOOGLE_LIMITED_USE}{' '}
          <a className={linkClass} href={GOOGLE_POLICY_URL} target="_blank" rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="Who else receives information">
        <p className="m-0">
          Booking details are shared with The Power Genie team so they can hold the appointment,
          and with the Sunrun representative handling the consult so they can prepare for it.
          The Sunrun quote form on the homepage is hosted by Sunrun, a separate company, and that
          form follows Sunrun’s own collection. We also use hosting and database providers to run
          the site. We do not sell personal information.
        </p>
        <p className="m-0">{SMS_NO_SHARE_SENTENCE}</p>
      </LegalSection>

      <LegalSection heading="How to request deletion">
        <p className="m-0">{DELETION_SENTENCE}</p>
        <p className="m-0">
          Tell us the email or phone number you used. We will delete the booking details, uploaded
          light bill, Smart Meter Texas data, and assistant messages we still have for you, and we
          will remove the related appointment from the connected Google Calendar when we can. We
          may keep a copy when the law requires it. You can also email {CONTACT_EMAIL} or call{' '}
          {CONTACT_PHONE_DISPLAY} to ask what we have stored about you.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
