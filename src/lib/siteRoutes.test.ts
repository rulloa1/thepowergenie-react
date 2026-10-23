import { describe, expect, it } from 'vitest';
import {
  legacyNodeRedirect,
  normalizePath,
  showMarketingAssistant,
  showRouterLegalFooter,
  sitePage,
} from './siteRoutes';

describe('public routes', () => {
  it('renders privacy and terms instead of the homepage', () => {
    expect(sitePage(normalizePath('/privacy'))).toBe('privacy');
    expect(sitePage(normalizePath('/privacy/'))).toBe('privacy');
    expect(sitePage(normalizePath('/terms'))).toBe('terms');
    expect(sitePage(normalizePath('/terms/'))).toBe('terms');
    expect(sitePage('/')).toBe('marketing');
    expect(showMarketingAssistant(sitePage('/privacy'))).toBe(false);
    expect(showMarketingAssistant(sitePage('/terms'))).toBe(false);
    expect(showRouterLegalFooter('/privacy')).toBe(true);
    expect(showRouterLegalFooter('/terms')).toBe(true);
    expect(showRouterLegalFooter('/')).toBe(false);
  });

  it('keeps Referral Hub routes and redirects the old /node booking URLs', () => {
    expect(sitePage('/book')).toBe('book');
    expect(sitePage('/dashboard')).toBe('dashboard');
    expect(legacyNodeRedirect(normalizePath('/node/book'))).toBe('/book');
    expect(legacyNodeRedirect(normalizePath('/node/dashboard'))).toBe('/dashboard');
    expect(legacyNodeRedirect(normalizePath('/node/book/'))).toBe('/book');
    expect(legacyNodeRedirect(normalizePath('/node/dashboard/'))).toBe('/dashboard');
    expect(legacyNodeRedirect('/privacy')).toBeNull();
    expect(sitePage('/node/book')).toBe('marketing');
  });
});
