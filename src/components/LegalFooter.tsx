import { focusRing } from './legalChrome';

const linkClass = `font-semibold text-[#0066CC] no-underline hover:underline ${focusRing}`;

/** Small Privacy and Terms links. Rendered once for every route. */
export default function LegalFooter({ homeChrome = false }: { homeChrome?: boolean }) {
  return (
    <footer
      className={`relative z-[46] border-t border-[#E3E8EF] bg-[#F6F7FB] px-4 text-center text-[13px] leading-relaxed text-[#4A5568] ${homeChrome ? 'pt-5 pb-28 sm:py-5' : 'py-4'}`}
    >
      <nav aria-label="Legal" className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <a className={linkClass} href="/privacy">Privacy</a>
        <span aria-hidden="true">·</span>
        <a className={linkClass} href="/terms">Terms</a>
      </nav>
    </footer>
  );
}
