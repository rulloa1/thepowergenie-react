import { useEffect, type ReactNode } from 'react';

export const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B00]';

export const fieldClass =
  'w-full rounded-xl border border-[#D5DDEA] bg-white px-3 py-3 text-base text-[#1A1A2E] outline-none focus:border-[#0066CC]';

export const primaryButtonClass =
  `inline-flex min-h-12 items-center justify-center rounded-full bg-[#1A1A2E] px-5 text-center font-bold text-white no-underline transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

export const secondaryButtonClass =
  `inline-flex min-h-11 items-center justify-center rounded-full border border-[#D5DDEA] bg-white px-4 text-center font-semibold text-[#1A1A2E] no-underline transition hover:border-[#0066CC] disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

export function usePageTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

export function useNoIndex(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [enabled]);
}

export function SiteShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#F4F7FB] text-[#1A1A2E]">{children}</div>;
}

export function TopBar({ action }: { action?: ReactNode }) {
  return (
    <header className="bg-[#0B2233] text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <a href="/" className={`flex min-w-0 items-center gap-3 text-white no-underline ${focusRing}`}>
          <img src="/assets/brand/power-genie-icon.png" alt="" className="h-9 w-9 shrink-0 rounded-lg" />
          <span className="truncate font-bold tracking-tight">The Power Genie</span>
        </a>
        {action ?? (
          <a href="/" className={`text-sm font-semibold text-[#D9E6F2] no-underline hover:underline ${focusRing}`}>
            Back to site
          </a>
        )}
      </div>
    </header>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'ok' | 'info'; children: ReactNode }) {
  const toneClass = tone === 'error'
    ? 'bg-[#FFF1F0] text-[#9B2C2C]'
    : tone === 'ok'
      ? 'bg-[#E8F6EC] text-[#135C2C]'
      : 'bg-[#FFF6E8] text-[#8A4B08]';
  return <p className={`m-0 rounded-xl px-3 py-2 text-sm leading-relaxed ${toneClass}`} role="status">{children}</p>;
}

export type CustomerFormValues = {
  name: string;
  phone: string;
  email: string;
  address: string;
  note: string;
};

export const emptyCustomer = (): CustomerFormValues => ({
  name: '',
  phone: '',
  email: '',
  address: '',
  note: '',
});

export function CustomerFields({
  idPrefix,
  values,
  onChange,
  yourDetails,
}: {
  idPrefix: string;
  values: CustomerFormValues;
  onChange: (values: CustomerFormValues) => void;
  yourDetails: boolean;
}) {
  const set = (key: keyof CustomerFormValues, value: string) => onChange({ ...values, [key]: value });
  return (
    <div className="grid gap-4">
      <Field id={`${idPrefix}-name`} label={yourDetails ? 'Your name' : 'Name'} value={values.name} autoComplete="name" onChange={(value) => set('name', value)} />
      <Field id={`${idPrefix}-phone`} label="Phone" value={values.phone} type="tel" autoComplete="tel" onChange={(value) => set('phone', value)} />
      <Field id={`${idPrefix}-email`} label="Email" value={values.email} type="email" autoComplete="email" onChange={(value) => set('email', value)} />
      <label className="grid gap-1 text-sm font-semibold" htmlFor={`${idPrefix}-address`}>
        Address
        <textarea
          id={`${idPrefix}-address`}
          className={`${fieldClass} min-h-20 resize-y`}
          value={values.address}
          autoComplete="street-address"
          onChange={(event) => set('address', event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm font-semibold" htmlFor={`${idPrefix}-note`}>
        {yourDetails ? 'Anything Horace should know? (optional)' : 'Note (optional)'}
        <textarea
          id={`${idPrefix}-note`}
          className={`${fieldClass} min-h-20 resize-y`}
          value={values.note}
          onChange={(event) => set('note', event.target.value)}
        />
      </label>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold" htmlFor={id}>
      {label}
      <input
        id={id}
        className={fieldClass}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
