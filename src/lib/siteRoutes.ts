/** Client routes for the public site. Old /node booking URLs redirect to the Referral Hub. */

export type SitePage = 'privacy' | 'terms' | 'book' | 'dashboard' | 'homeowner' | 'marketing';

/** Brand family pages rendered by the marketing app. Gas Genie is reachable; its service stays marked coming soon. */
export const BRAND_PAGES = ['brands', 'celebrity-solar', 'hip-hop-solar', 'gas-genie'] as const;

export type BrandPageId = (typeof BRAND_PAGES)[number];

export type MarketingView = 'journey' | BrandPageId;

export function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

export function isBrandPage(value: string | null | undefined): value is BrandPageId {
  return !!value && (BRAND_PAGES as readonly string[]).includes(value);
}

/** `/brands`, `/celebrity-solar`, `/hip-hop-solar`, and `/gas-genie`, including a trailing slash. */
export function brandPageFromPath(pathname: string): BrandPageId | null {
  const slug = normalizePath(pathname).slice(1);
  return isBrandPage(slug) ? slug : null;
}

/** Quote-form referral brands. The family index is a page, not a source. */
const REFERRAL_BRANDS = ['celebrity-solar', 'hip-hop-solar', 'gas-genie'] as const;

export type ReferralBrand = (typeof REFERRAL_BRANDS)[number];

export function isReferralBrand(value: string | null | undefined): value is ReferralBrand {
  return !!value && (REFERRAL_BRANDS as readonly string[]).includes(value);
}

/**
 * Legacy files such as `/celebrity-solar.html` still attribute the quote form.
 * They are not marketing routes; those stay extensionless (`/celebrity-solar`).
 */
export function legacyHtmlBrandSource(pathname: string): ReferralBrand | null {
  const file = pathname.split('/').pop() ?? '';
  if (!file.includes('.html')) return null;
  const slug = file.replace('.html', '');
  return isReferralBrand(slug) ? slug : null;
}

/** Extensionless brand paths, then legacy `.html` filenames. */
export function referralBrandFromLocation(pathname: string): ReferralBrand | null {
  const fromRoute = brandPageFromPath(pathname);
  if (isReferralBrand(fromRoute)) return fromRoute;
  return legacyHtmlBrandSource(pathname);
}

/**
 * Path wins over `?view=` so a refresh of `/celebrity-solar` stays on that page.
 * `?view=` remains for older links.
 */
export function marketingViewFromLocation(pathname: string, search: string): MarketingView {
  const fromPath = brandPageFromPath(pathname);
  if (fromPath) return fromPath;
  const view = new URLSearchParams(search).get('view');
  return isBrandPage(view) ? view : 'journey';
}

/** Canonical path for a marketing view. Drops `?view=` and keeps other query params. */
export function marketingViewHref(view: MarketingView, current: URL): string {
  const url = new URL(current.href);
  url.searchParams.delete('view');
  url.hash = '';
  url.pathname = view === 'journey' ? '/' : `/${view}`;
  const search = url.searchParams.toString();
  return url.pathname + (search ? `?${search}` : '');
}

/** Plain primary clicks stay in the SPA. Modified clicks follow the real href. */
export function shouldHandleClientNavigation(event: {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return event.button === 0
    && !event.defaultPrevented
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey;
}

/** Matches the permanent Vercel redirects for the removed booking URLs. */
export function legacyNodeRedirect(path: string): '/book' | '/dashboard' | null {
  if (path === '/node/book') return '/book';
  if (path === '/node/dashboard') return '/dashboard';
  return null;
}

export function sitePage(path: string): SitePage {
  if (path === '/privacy') return 'privacy';
  if (path === '/terms') return 'terms';
  if (path === '/book') return 'book';
  if (path === '/dashboard' || path === '/pipeline' || path === '/hub') return 'dashboard';
  if (path === '/homeowner' || path === '/portal' || path === '/referrals') return 'homeowner';
  return 'marketing';
}

/**
 * Public pages get the booking chat bubble. The Referral Hub is the exception:
 * the bubble stays off /dashboard, including the signed-in dashboard and its sign-in screen.
 */
export function showMarketingAssistant(page: SitePage): boolean {
  return page !== 'dashboard';
}

/** Accent for the chat bubble. The journey, booking, legal, and portal pages use Power Genie orange. */
export function assistantBrandFromView(view: MarketingView): 'power-genie' | BrandPageId {
  return view === 'journey' ? 'power-genie' : view;
}

/**
 * Homepage and brand pages render the footer inside the marketing layout
 * (the homepage needs extra padding under the fixed quote button).
 * Every other route gets the shared footer from the router.
 */
export function showRouterLegalFooter(path: string): boolean {
  const normalized = normalizePath(path);
  if (normalized === '/') return false;
  if (brandPageFromPath(normalized)) return false;
  return true;
}
