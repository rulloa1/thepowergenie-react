/** Client routes for the public site. Old /node booking URLs redirect to the Referral Hub. */

export type SitePage = 'privacy' | 'terms' | 'book' | 'dashboard' | 'homeowner' | 'marketing';

export function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
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
  if (path === '/dashboard') return 'dashboard';
  if (path === '/homeowner' || path === '/portal' || path === '/referrals') return 'homeowner';
  return 'marketing';
}

/** The marketing assistant stays off the hub and the legal pages. */
export function showMarketingAssistant(page: SitePage): boolean {
  return page === 'marketing';
}

/**
 * Homepage footer is rendered inside the marketing layout (it needs extra
 * padding under the fixed quote button). Every other route gets the shared footer.
 */
export function showRouterLegalFooter(path: string): boolean {
  return path !== '/';
}
