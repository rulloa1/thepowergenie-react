import { focusRing } from './legalChrome';

const linkClass = `font-semibold text-[#0066CC] no-underline hover:underline ${focusRing}`;

/**
 * Existing program pages already in this repo (gas-genie.html, celebrity-solar.html,
 * hip-hop-solar.html, sport-and-solar.html). Vercel rewrites these paths onto those
 * files. The SPA brand routes (/gas-genie, /celebrity-solar, /hip-hop-solar) stay separate.
 */
export const LAUNCH_PAGES = [
  { href: '/launch/gas-genie', label: 'Gas Genie' },
  { href: '/launch/celebrity-solar', label: 'Celebrity Solar' },
  { href: '/launch/hip-hop-solar', label: 'Hip Hop Solar' },
  { href: '/sport-and-solar', label: 'Sport & Solar' },
] as const;

/** Launch-page links plus Privacy and Terms. Rendered once for every route. */
export default function LegalFooter({ homeChrome = false }: { homeChrome?: boolean }) {
  return (
    <footer
      className={`relative z-[46] border-t border-[#E3E8EF] bg-[#F6F7FB] px-4 text-center text-[13px] leading-relaxed text-[#4A5568] ${homeChrome ? 'pt-5 pb-28 sm:py-5' : 'py-4'}`}
    >
      <nav aria-label="Explore our programs" className="mx-auto mb-2 flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span>Explore our programs:</span>
        {LAUNCH_PAGES.map((page, i) => (
          <span key={page.href} className="inline-flex items-center gap-x-2">
            {i > 0 ? <span aria-hidden="true">·</span> : null}
            <a className={linkClass} href={page.href}>{page.label}</a>
          </span>
        ))}
      </nav>
      <nav aria-label="Legal" className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <a className={linkClass} href="/privacy">Privacy Policy</a>
        <span aria-hidden="true">·</span>
        <a className={linkClass} href="/terms">Terms</a>
      </nav>
    </footer>
  );
}
