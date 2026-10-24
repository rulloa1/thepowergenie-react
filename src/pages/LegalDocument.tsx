import type { ReactNode } from 'react';
import { focusRing, usePageTitle } from '../components/legalChrome';
import { CONTACT_EMAIL, EFFECTIVE_DATE, SITE_URL } from '../lib/legal';

const linkClass = `font-semibold text-[#0066CC] no-underline hover:underline ${focusRing}`;

export default function LegalDocument({ title, children }: { title: string; children: ReactNode }) {
  usePageTitle(`${title} — The Power Genie`);
  return (
    <div className="min-h-screen bg-[#F4F7FB] text-[#1A1A2E]">
      <header className="bg-[#0B2233] text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <a href="/" className={`flex min-w-0 items-center gap-3 text-white no-underline ${focusRing}`}>
            <img src="/assets/brand/power-genie-icon.png" alt="" className="h-9 w-9 shrink-0 rounded-lg" />
            <span className="truncate font-bold tracking-tight">The Power Genie</span>
          </a>
          <a href="/" className={`shrink-0 text-sm font-semibold text-[#D9E6F2] no-underline hover:underline ${focusRing}`}>
            Back to site
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <p className="m-0 text-xs font-bold uppercase tracking-[0.14em] text-[#FF6B00]">Houston solar referrals</p>
        <h1 className="m-0 mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="m-0 mt-3 text-sm leading-relaxed text-[#4A5568]">
          Effective {EFFECTIVE_DATE}
          {' · '}
          <a className={linkClass} href={SITE_URL}>{SITE_URL.replace('https://', '')}</a>
        </p>
        <div className="mt-8 grid gap-8 text-[1.02rem] leading-relaxed [overflow-wrap:anywhere]">{children}</div>
        <p className="m-0 mt-10 text-sm text-[#4A5568]">
          Questions:{' '}
          <a className={linkClass} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </main>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="m-0 text-xl font-bold tracking-tight">{heading}</h2>
      <div className="mt-3 grid gap-3 text-[#243044]">{children}</div>
    </section>
  );
}
