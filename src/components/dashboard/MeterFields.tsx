import { METER_CONSENT_TEXT } from '../../lib/esiId';
import { inputClass } from '../../hub/ui';

export type MeterFormValues = {
  esiId: string;
  meterNumber: string;
  email: string;
  consent: boolean;
};

export function emptyMeter(): MeterFormValues {
  return { esiId: '', meterNumber: '', email: '', consent: false };
}

export function meterBodyFrom(values: MeterFormValues): {
  esiId: string;
  meterNumber: string;
  email: string;
  consent: boolean;
} | null {
  const blank = !values.esiId.trim() && !values.meterNumber.trim() && !values.email.trim() && !values.consent;
  if (blank) return null;
  return {
    esiId: values.esiId,
    meterNumber: values.meterNumber,
    email: values.email,
    consent: values.consent,
  };
}

export function MeterFields({
  values,
  onChange,
}: {
  values: MeterFormValues;
  onChange: (values: MeterFormValues) => void;
}) {
  const set = (patch: Partial<MeterFormValues>) => onChange({ ...values, ...patch });
  return (
    <fieldset id="connect-meter" className="grid gap-3 rounded-2xl border border-[#D5DDEA] px-4 py-4">
      <legend className="px-1 text-sm font-bold">Connect your meter</legend>
      <p className="m-0 text-sm leading-relaxed text-[#4A5568]">
        Optional. Enter the ESI ID and meter number from your electric bill if you want Horace to review your usage before the call. Smart Meter Texas emails you to approve it. You can leave this blank and still book.
      </p>
      <label className="grid gap-1 text-sm font-semibold" htmlFor="book-esi-id">
        ESI ID
        <input
          id="book-esi-id"
          className={inputClass}
          inputMode="numeric"
          autoComplete="off"
          value={values.esiId}
          onChange={(event) => set({ esiId: event.target.value })}
        />
      </label>
      <label className="grid gap-1 text-sm font-semibold" htmlFor="book-meter-number">
        Meter number
        <input
          id="book-meter-number"
          className={inputClass}
          autoComplete="off"
          value={values.meterNumber}
          onChange={(event) => set({ meterNumber: event.target.value })}
        />
      </label>
      <label className="grid gap-1 text-sm font-semibold" htmlFor="book-meter-email">
        Email for the Smart Meter Texas approval
        <span className="font-normal text-[#4A5568]">Leave this blank to use the email above.</span>
        <input
          id="book-meter-email"
          className={inputClass}
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(event) => set({ email: event.target.value })}
        />
      </label>
      <label className="flex items-start gap-3 text-sm leading-relaxed" htmlFor="book-meter-consent">
        <input
          id="book-meter-consent"
          className="mt-1 h-4 w-4 shrink-0"
          type="checkbox"
          checked={values.consent}
          onChange={(event) => set({ consent: event.target.checked })}
        />
        <span>{METER_CONSENT_TEXT}</span>
      </label>
    </fieldset>
  );
}
