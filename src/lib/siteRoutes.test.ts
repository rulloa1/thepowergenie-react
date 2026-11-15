import { describe, expect, it } from 'vitest';
import {
  brandPageFromPath,
  legacyHtmlBrandSource,
  legacyNodeRedirect,
  referralBrandFromLocation,
  marketingViewFromLocation,
  hubTabFromLocation,
  marketingViewHref,
  normalizePath,
  assistantBrandFromView,
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
    expect(showMarketingAssistant(sitePage('/privacy'))).toBe(true);
    expect(showMarketingAssistant(sitePage('/terms'))).toBe(true);
    expect(showMarketingAssistant(sitePage('/'))).toBe(true);
    expect(showRouterLegalFooter('/privacy')).toBe(true);
    expect(showRouterLegalFooter('/terms')).toBe(true);
    expect(showRouterLegalFooter('/')).toBe(false);
  });

  it('keeps Referral Hub routes and redirects the old /node booking URLs', () => {
    expect(sitePage('/book')).toBe('book');
    expect(sitePage('/dashboard')).toBe('dashboard');
    expect(sitePage('/dashboard/')).toBe('dashboard');
    expect(sitePage('/dashboard/chat')).toBe('dashboard');
    expect(sitePage('/dashboard/files')).toBe('dashboard');
    expect(sitePage('/pipeline')).toBe('dashboard');
    expect(sitePage('/pipeline/leads')).toBe('dashboard');
    expect(sitePage('/hub')).toBe('dashboard');
    expect(sitePage('/hub/schedule')).toBe('dashboard');
    expect(hubTabFromLocation('/pipeline', '')).toBe('leads');
    expect(hubTabFromLocation('/dashboard/chat', '?tab=files')).toBe('chat');
    expect(hubTabFromLocation('/hub/files', '')).toBe('files');
    expect(hubTabFromLocation('/dashboard', '?tab=schedule')).toBe('schedule');
    expect(hubTabFromLocation('/dashboard', '?tab=chat')).toBe('chat');
    expect(hubTabFromLocation('/dashboard', '?tab=conference')).toBe('conference');
    expect(hubTabFromLocation('/dashboard/conference', '')).toBe('conference');
    expect(hubTabFromLocation('/dashboard', '')).toBe('leads');
    expect(showMarketingAssistant(sitePage('/dashboard/chat'))).toBe(false);
    expect(showMarketingAssistant(sitePage('/hub'))).toBe(false);
    expect(sitePage('/homeowner')).toBe('homeowner');
    expect(sitePage('/portal')).toBe('homeowner');
    expect(sitePage('/referrals')).toBe('homeowner');
    expect(showMarketingAssistant(sitePage('/book'))).toBe(true);
    expect(showMarketingAssistant(sitePage('/homeowner'))).toBe(true);
    expect(showMarketingAssistant(sitePage('/portal'))).toBe(true);
    expect(showMarketingAssistant(sitePage('/dashboard'))).toBe(false);
    expect(showMarketingAssistant(sitePage('/pipeline'))).toBe(false);
    expect(sitePage('/room')).toBe('room');
    expect(sitePage('/room/abcdefghijklmnopqrstuvwxyz012345')).toBe('room');
    expect(showMarketingAssistant(sitePage('/room'))).toBe(false);
    expect(showRouterLegalFooter('/room/abcdefghijklmnopqrstuvwxyz012345')).toBe(false);
    expect(showRouterLegalFooter('/homeowner')).toBe(true);
    expect(legacyNodeRedirect(normalizePath('/node/book'))).toBe('/book');
    expect(legacyNodeRedirect(normalizePath('/node/dashboard'))).toBe('/dashboard');
    expect(legacyNodeRedirect(normalizePath('/node/book/'))).toBe('/book');
    expect(legacyNodeRedirect(normalizePath('/node/dashboard/'))).toBe('/dashboard');
    expect(legacyNodeRedirect('/privacy')).toBeNull();
    expect(sitePage('/node/book')).toBe('marketing');
  });

  it('serves the brand family as marketing pages with their own paths', () => {
    for (const path of ['/brands', '/celebrity-solar', '/hip-hop-solar', '/gas-genie']) {
      expect(sitePage(normalizePath(path))).toBe('marketing');
      expect(showMarketingAssistant(sitePage(path))).toBe(true);
      expect(showRouterLegalFooter(path)).toBe(false);
      expect(showRouterLegalFooter(`${path}/`)).toBe(false);
      expect(brandPageFromPath(path)).toBe(path.slice(1));
      expect(marketingViewFromLocation(path, '')).toBe(path.slice(1));
    }

    expect(brandPageFromPath('/')).toBeNull();
    expect(brandPageFromPath('/privacy')).toBeNull();
    expect(brandPageFromPath('/celebrity-solar.html')).toBeNull();
    expect(brandPageFromPath('/homeowner')).toBeNull();
    expect(marketingViewFromLocation('/celebrity-solar.html', '')).toBe('journey');
    expect(legacyHtmlBrandSource('/celebrity-solar.html')).toBe('celebrity-solar');
    expect(legacyHtmlBrandSource('/hip-hop-solar.html')).toBe('hip-hop-solar');
    expect(legacyHtmlBrandSource('/gas-genie.html')).toBe('gas-genie');
    expect(legacyHtmlBrandSource('/nested/celebrity-solar.html')).toBe('celebrity-solar');
    expect(legacyHtmlBrandSource('/celebrity-solar')).toBeNull();
    expect(legacyHtmlBrandSource('/brands.html')).toBeNull();
    expect(referralBrandFromLocation('/celebrity-solar')).toBe('celebrity-solar');
    expect(referralBrandFromLocation('/celebrity-solar.html')).toBe('celebrity-solar');
    expect(referralBrandFromLocation('/brands')).toBeNull();
    expect(referralBrandFromLocation('/homeowner')).toBeNull();
    expect(marketingViewFromLocation('/', '?view=brands')).toBe('brands');
    expect(marketingViewFromLocation('/', '?view=gas-genie')).toBe('gas-genie');
    expect(marketingViewFromLocation('/celebrity-solar', '?view=brands')).toBe('celebrity-solar');
    expect(marketingViewFromLocation('/', '?view=nope')).toBe('journey');
    expect(marketingViewFromLocation('/book', '')).toBe('journey');

    const branded = new URL('https://thepowergenie.theroyeffect.com/?view=celebrity-solar&source=celebrity-solar');
    expect(marketingViewHref('celebrity-solar', branded)).toBe('/celebrity-solar?source=celebrity-solar');
    expect(marketingViewHref('journey', new URL('https://thepowergenie.theroyeffect.com/brands?view=brands'))).toBe('/');
    expect(marketingViewHref('brands', new URL('https://thepowergenie.theroyeffect.com/gas-genie'))).toBe('/brands');
    expect(assistantBrandFromView('journey')).toBe('power-genie');
    expect(assistantBrandFromView('celebrity-solar')).toBe('celebrity-solar');
    expect(assistantBrandFromView('hip-hop-solar')).toBe('hip-hop-solar');
    expect(assistantBrandFromView('gas-genie')).toBe('gas-genie');
    expect(assistantBrandFromView('brands')).toBe('brands');
  });
});
