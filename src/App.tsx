import React, { useState, useEffect, useRef } from 'react';
import { Mail, Phone } from 'lucide-react';
import ScrollWorld from './components/ScrollWorld';
import BrandPage from './components/BrandPage';
import Toast from './components/Toast';
import { Config } from './types';
import LegalFooter from './components/LegalFooter';
import { openAssistant } from './lib/openAssistant';
import {
  isBrandPage,
  referralBrandFromLocation,
  marketingViewFromLocation,
  marketingViewHref,
  type MarketingView,
} from './lib/siteRoutes';

const config: Config = {
  brand: { name: 'The Power Genie', href: '#top', logo: 'assets/brand/power-genie-lockup.webp' },
  mobileClipsUseDesktopFraming: true,
  diveScroll: 1.1,
  connScroll: 0.45,
  hint: 'scroll to explore',
  nav: true,
  atmosphere: true,
  cta: { label: 'Get a Quote', href: '#quote' },
  sections: [
    {
      id: 'sun',
      label: 'The Source',
      still: 'assets/stills/01-sun.webp',
      stillMobile: 'assets/stills/01-sun-m.webp',
      clip: 'assets/vid/encoded/01-sun-dive.mp4',
      clipMobile: 'assets/vid/mobile/01-sun-dive.mp4',
      accent: '#FF6B00',
      eyebrow: 'Where It Begins',
      title: 'A brighter way to power home.',
      body: 'Every second, the sun releases more energy than humanity has used in all of history. The Power Genie brings that power home to Houston.',
      tags: ['Solar Energy', 'Battery Storage'],
      cta: {
        primary: { label: 'Explore Your Solar Options', href: '#quote' },
        secondary: { label: 'Book a free savings consult', href: '#consult' },
      }
    },
    {
      id: 'roof',
      label: 'Your Roof',
      still: 'assets/stills/02-roof.webp',
      stillMobile: 'assets/stills/02-roof-m.webp',
      clip: 'assets/vid/encoded/02-roof-dive.mp4',
      clipMobile: 'assets/vid/mobile/02-roof-dive.mp4',
      accent: '#0066CC',
      eyebrow: 'Capture The Light',
      title: 'Solar, Beautifully Done',
      body: 'Sleek all-black panels that look as good as they perform. Professionally installed, backed by a 25-year warranty.',
      tags: ['Premium Panels', 'Expert Install', '25-Year Warranty']
    },
    {
      id: 'battery',
      label: 'Storage',
      still: 'assets/stills/03-battery.webp',
      stillMobile: 'assets/stills/03-battery-m.webp',
      clip: 'assets/vid/encoded/03-battery-dive.mp4',
      clipMobile: 'assets/vid/mobile/03-battery-dive.mp4',
      accent: '#4CAF50',
      eyebrow: 'Tesla Powerwall',
      title: 'Battery Backup, by Tesla',
      body: 'Your panels charge a Tesla Powerwall all day. When the grid goes dark — storm season, peak hours, outages — it keeps your lights and your AC running.',
      tags: ['Tesla Powerwall', 'Outage Protection', 'Peak Savings']
    },
    {
      id: 'home',
      label: 'Home',
      still: 'assets/stills/04-home.webp',
      stillMobile: 'assets/stills/04-home-m.webp',
      clip: 'assets/vid/encoded/04-home-dive.mp4',
      clipMobile: 'assets/vid/mobile/04-home-dive.mp4',
      accent: '#FFF8F0',
      eyebrow: 'Power Everything',
      title: 'Your Home, Powered',
      body: 'Run the AC through a Houston summer, charge your EV, and live comfortably — all on clean energy you generate.',
      tags: ['Lower Bills', 'EV Ready', 'Smart Home']
    },
    {
      id: 'community',
      label: 'Community',
      still: 'assets/stills/05-community.webp',
      stillMobile: 'assets/stills/05-community-m.webp',
      clip: 'assets/vid/encoded/05-community-dive.mp4',
      clipMobile: 'assets/vid/mobile/05-community-dive.mp4',
      accent: '#4CAF50',
      eyebrow: 'Join The Movement',
      title: 'Your Neighborhood',
      body: 'Join Houston families going solar. Build a cleaner, more resilient community together.',
      tags: ['Local Impact', 'Growing Network', 'Cleaner Future']
    },
    {
      id: 'cta',
      label: 'Get Started',
      still: 'assets/stills/06-cta.webp',
      stillMobile: 'assets/stills/06-cta-m.webp',
      clip: 'assets/vid/encoded/06-cta-dive.mp4',
      clipMobile: 'assets/vid/mobile/06-cta-dive.mp4',
      accent: '#FF6B00',
      eyebrow: 'Your Turn',
      title: 'Go Solar Today',
      body: 'Lower your bills, protect your home, and power the future. Get your free custom solar quote in minutes.',
      tags: ['Zero Down', 'Immediate Savings', 'Clean Energy'],
      cta: {
        primary: { label: 'Get My Free Quote', href: '#quote' },
        secondary: { label: 'Book a free savings consult', href: '#consult' },
      }
    }
  ],
  connectors: [
    'assets/vid/encoded/c01-sun-roof.mp4',
    'assets/vid/encoded/c02-roof-battery.mp4',
    'assets/vid/encoded/c03-battery-home.mp4',
    'assets/vid/encoded/c04-home-community.mp4',
    'assets/vid/encoded/c05-community-cta.mp4'
  ],
  connectorsMobile: [
    'assets/vid/mobile/c01-sun-roof.mp4',
    'assets/vid/mobile/c02-roof-battery.mp4',
    'assets/vid/mobile/c03-battery-home.mp4',
    'assets/vid/mobile/c04-home-community.mp4',
    'assets/vid/mobile/c05-community-cta.mp4'
  ]
};

// Main application component
export default function App() {
  const [source, setSource] = useState<string | null>(null);
  const [view, setView] = useState<MarketingView>(() =>
    marketingViewFromLocation(window.location.pathname, window.location.search),
  );
  // The Salesforce form autofocuses a field on load, which scrolls the whole page
  // down to it. Only mount it once most of the form box is already on screen
  // (or the visitor taps a quote button), so the autofocus has nowhere to jump.
  const formBoxRef = useRef<HTMLDivElement>(null);
  const quoteRef = useRef<HTMLElement>(null);
  const [formReady, setFormReady] = useState(false);
  const [quoteInView, setQuoteInView] = useState(false);
  const [toast, setToast] = useState<{ isVisible: boolean; message: string; submessage?: string }>({
    isVisible: false,
    message: '',
    submessage: ''
  });

  useEffect(() => {
    const allowed = new Set(['celebrity-solar', 'hip-hop-solar', 'gas-genie']);
    const params = new URLSearchParams(window.location.search);
    const incoming = params.get('source');
    const pageBrand = referralBrandFromLocation(window.location.pathname);

    let currentSource = allowed.has(incoming || '') ? incoming : pageBrand;
    
    try {
      if (currentSource) {
        sessionStorage.setItem('powergenie-source', currentSource);
      } else {
        currentSource = sessionStorage.getItem('powergenie-source');
      }
    } catch (e) {
      // Fallback
    }
    
    if (currentSource && allowed.has(currentSource)) {
      setSource(currentSource);
    }
  }, []);

  useEffect(() => {
    const syncView = () => {
      setView(marketingViewFromLocation(window.location.pathname, window.location.search));
    };
    window.addEventListener('popstate', syncView);
    return () => window.removeEventListener('popstate', syncView);
  }, []);

  useEffect(() => {
    const href = marketingViewHref(view, new URL(window.location.href));
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const legacyQuery = new URLSearchParams(window.location.search).has('view');
    if ((view !== 'journey' || legacyQuery) && current !== href) {
      window.history.replaceState({}, '', href);
    }
  }, [view]);

  useEffect(() => {
    const el = quoteRef.current;
    if (!el || view !== 'journey') {
      setQuoteInView(false);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      setQuoteInView(entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.12));
    }, { threshold: [0, 0.12, 0.4] });
    io.observe(el);
    return () => io.disconnect();
  }, [view]);

  useEffect(() => {
    document.documentElement.classList.toggle('quote-in-view', quoteInView);
    return () => document.documentElement.classList.remove('quote-in-view');
  }, [quoteInView]);

  useEffect(() => {
    if (formReady || view !== 'journey') return;
    const el = formBoxRef.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) { setFormReady(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.intersectionRatio >= 0.75)) { setFormReady(true); io.disconnect(); }
    }, { threshold: [0.75] });
    io.observe(el);
    return () => io.disconnect();
  }, [formReady, view]);

  const triggerToast = (message = "Excellent choice!", submessage = "Opening your custom solar quote form below.") => {
    setToast({ isVisible: true, message, submessage });
    setFormReady(true);
  };

  const getSalesforceUrl = (baseUrl: string) => {
    try {
      const url = new URL(baseUrl);
      if (source) {
        url.searchParams.set('utm_source', source);
        url.searchParams.set('utm_medium', 'brand_site');
        url.searchParams.set('utm_campaign', 'power_genie');
      }
      return url.href;
    } catch (e) {
      return baseUrl;
    }
  };

  const handleNavigate = (newView: string) => {
    const next: MarketingView = newView === 'journey' || isBrandPage(newView) ? newView : 'journey';
    const href = marketingViewHref(next, new URL(window.location.href));
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const applyNav = () => {
      setView(next);
      window.scrollTo(0, 0);
      if (current !== href) window.history.pushState({}, '', href);
    };

    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (document as any).startViewTransition(applyNav);
    } else {
      applyNav();
    }
  };

  if (view !== 'journey') {
    return (
      <>
        <BrandPage
          id={view}
          onNavigate={handleNavigate} 
          getSalesforceUrl={getSalesforceUrl} 
          onQuoteClick={triggerToast}
        />
        <LegalFooter />
      </>
    );
  }

  return (
    <div className="relative">
      <main id="world">
        <ScrollWorld
          config={config}
          onQuoteClick={() => triggerToast()}
          onNavigateBrands={() => handleNavigate('brands')}
        />
      </main>

      {/* Mobile Fixed CTA. Hidden once the quote is on screen so it does not cover the form. */}
      {!quoteInView && (
      <div className="sm:hidden fixed z-60 left-4 right-4 bottom-[max(12px,env(safe-area-inset-bottom))] pointer-events-none">
        <a 
          href="#quote" 
          onClick={(e) => {
            e.preventDefault();
            triggerToast();
            document.getElementById('quote')?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="quote-cta-mobile flex items-center justify-center min-h-[52px] w-full bg-[#1A1A2E] text-white font-bold rounded-full shadow-lg pointer-events-auto no-underline"
        >
          Get a Free Quote
        </a>
      </div>
      )}

      <Toast 
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
        message={toast.message}
        submessage={toast.submessage}
      />

      <section ref={quoteRef} className="quote-panel relative z-45 min-h-screen bg-[#F6F7FB] text-[#1A1A2E] p-[calc(clamp(84px,10vw,112px)+env(safe-area-inset-top))_clamp(16px,5vw,64px)_calc(40px+env(safe-area-inset-bottom))]" id="quote" aria-labelledby="quote-title" tabIndex={-1}>
        <p className="quote-panel__eyebrow m-0 mb-2 text-[0.74rem] font-semibold tracking-[0.14em] uppercase text-[#FF6B00]">Your free quote</p>
        <h2 id="quote-title" className="m-0 mb-4 text-[#1A1A2E] font-bold text-[clamp(1.7rem,3.6vw,2.6rem)] tracking-tight leading-[1.1]">Let's power your home.</h2>
        <div className="mb-7">
          <button
            type="button"
            data-testid="book-consult"
            onClick={() => openAssistant('book')}
            className="inline-flex items-center justify-center min-h-[48px] px-5 rounded-full bg-[#FF6B00] text-white font-bold shadow-[0_8px_20px_rgba(255,107,0,0.28)]"
          >
            Book a free savings consult
          </button>
        </div>
        <div className="quote-panel__grid grid grid-cols-1 md:grid-cols-[minmax(260px,340px)_1fr] gap-[clamp(20px,3vw,40px)] items-start max-w-[1280px]">
          <aside className="rep-card bg-[#0B2233] text-[#F7FBFF] rounded-[18px] p-[26px_24px] shadow-[0_12px_32px_rgba(10,20,40,0.18)]" aria-label="Your Sunrun solar expert">
            <p className="rep-card__name m-0 text-[1.35rem] font-bold tracking-tight">Horace Lawrence</p>
            <p className="rep-card__role m-0 mt-1 mb-[18px] text-[0.9rem] text-[#A9C1D6]">The Block Sales Expert Team Lead · Sunrun</p>
            <ul className="rep-card__contact grid gap-2 m-0 mb-5 p-0 list-none">
              <li>
                <a href="mailto:horace.lawrence@sunrun.com" className="inline-flex items-center gap-[10px] text-white font-semibold text-[0.95rem] no-underline break-all hover:underline focus-visible:underline">
                  <Mail className="flex-none w-[18px] h-[18px] text-[#FF8A2B]" />
                  horace.lawrence@sunrun.com
                </a>
              </li>
              <li>
                <a href="tel:+15102417007" className="inline-flex items-center gap-[10px] text-white font-semibold text-[0.95rem] no-underline break-all hover:underline focus-visible:underline">
                  <Phone className="flex-none w-[18px] h-[18px] text-[#FF8A2B]" />
                  510-241-7007
                </a>
              </li>
            </ul>
            <p className="rep-card__intro m-0 mb-[14px] text-[0.95rem] leading-[1.55] text-[#D9E6F2]">Hi, I'm Horace! I'm dedicated to making the process of going solar as easy as possible. Why solar?</p>
            <ul className="rep-card__why grid gap-[10px] m-0 p-0 list-none">
              <li className="relative pl-[26px] text-[0.92rem] leading-[1.45] text-[#F7FBFF] before:content-[''] before:absolute before:left-0 before:top-[0.32em] before:w-[14px] before:h-[14px] before:rounded-full before:bg-[#FF6B00] before:shadow-[inset_0_0_0_4px_#0B2233]">Lock in a rate to avoid rising utility costs.</li>
              <li className="relative pl-[26px] text-[0.92rem] leading-[1.45] text-[#F7FBFF] before:content-[''] before:absolute before:left-0 before:top-[0.32em] before:w-[14px] before:h-[14px] before:rounded-full before:bg-[#FF6B00] before:shadow-[inset_0_0_0_4px_#0B2233]">A more reliable source of energy for your home.</li>
              <li className="relative pl-[26px] text-[0.92rem] leading-[1.45] text-[#F7FBFF] before:content-[''] before:absolute before:left-0 before:top-[0.32em] before:w-[14px] before:h-[14px] before:rounded-full before:bg-[#FF6B00] before:shadow-[inset_0_0_0_4px_#0B2233]">With a battery, protection during blackouts.</li>
            </ul>
          </aside>
          <div ref={formBoxRef} className="quote-panel__formwrap bg-white rounded-[18px] overflow-hidden shadow-[0_12px_32px_rgba(10,20,40,0.12)]">
            {formReady ? (
              <iframe
                className="quote-panel__frame block w-full h-[min(900px,82vh)] border-0 bg-white"
                title="Sunrun quote request form"
                src={getSalesforceUrl("https://sunrun.my.salesforce-sites.com/purl/?srep=/powergenie#form-group")}
                referrerPolicy="strict-origin-when-cross-origin"
              ></iframe>
            ) : (
              <div className="quote-panel__frame flex w-full h-[min(900px,82vh)] items-center justify-center bg-white text-[0.9rem] text-[#4A5568]">
                Loading the quote form…
              </div>
            )}
            <p className="quote-panel__alt m-0 p-[12px_18px] text-[0.86rem] text-[#4A5568] border-t border-[rgba(26,26,46,0.08)]">
              Form not loading? <a href={getSalesforceUrl("https://sunrun.my.salesforce-sites.com/purl/?srep=/powergenie")} target="_blank" rel="noopener" className="text-[#0066CC] font-semibold">Open it in a new tab</a>.
            </p>
          </div>
        </div>
        <p className="mt-8 max-w-[1280px] text-[0.98rem] leading-relaxed text-[#4A5568] flex flex-wrap gap-4 items-center">
          <a href="/book" className="font-semibold text-[#0066CC] no-underline hover:underline focus-visible:underline">Book a one-hour call on Horace’s calendar</a>
          <span className="text-gray-300">·</span>
          <a href="/homeowner" className="inline-flex items-center gap-1.5 font-bold text-[#FF6B00] no-underline hover:underline focus-visible:underline">
            🔋 Homeowner App: Tesla Powerwall Monitor & $1,000 Referral Program →
          </a>
        </p>
        <LegalFooter homeChrome />
      </section>
    </div>
  );
}
