import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Mail, Phone, Calendar, ArrowUpRight, Sparkles } from 'lucide-react';
import ScrollWorld from './components/ScrollWorld';
import BrandPage from './components/BrandPage';
import Toast from './components/Toast';
import { Config } from './types';
import LegalFooter from './components/LegalFooter';
import { openAssistant } from './lib/openAssistant';
import {
  assistantBrandFromView,
  isBrandPage,
  referralBrandFromLocation,
  marketingViewFromLocation,
  marketingViewHref,
  type MarketingView,
} from './lib/siteRoutes';

const config: Config = {
  brand: { name: 'The Power Genie', href: '#top', logo: 'assets/brand/power-genie-lockup.webp' },
  mobileClipsUseDesktopFraming: true,
  diveScroll: 1.5,
  connScroll: 1.1,
  hint: 'scroll to explore',
  nav: true,
  atmosphere: true,
  cta: { label: 'Book a free consultation', href: '/book' },
  sections: [
    {
      id: 'sun',
      label: 'The Source',
      still: 'assets-v2/stills/01-sun.webp',
      stillMobile: 'assets-v2/stills/01-sun-m.webp',
      clip: 'assets-v2/vid/encoded/01-sun-loop.mp4',
      clipMobile: 'assets-v2/vid/mobile/01-sun-loop.mp4',
      // Dive in, then ease back out so the section ends on its connector's first frame.
      scroll: 2.4,
      linger: 0.4,
      accent: '#FF6B00',
      eyebrow: 'Texas Solar Generation',
      title: 'Could solar fit your Texas home?',
      body: 'Review your electricity use, roof, and solar and battery options with Horace Lawrence, your Sunrun solar advisor. Get a personalized assessment with no obligation.',
      tags: ['Personalized assessment', 'No obligation', 'Bill optional to book'],
      cta: {
        primary: { label: 'Book a free consultation', href: '/book' },
        secondary: { label: 'Meet your solar advisor', href: '#quote' },
      }
    },
    {
      id: 'roof',
      label: 'Your Roof',
      still: 'assets-v2/stills/02-roof.webp',
      stillMobile: 'assets-v2/stills/02-roof-m.webp',
      clip: 'assets-v2/vid/encoded/02-roof-loop.mp4',
      clipMobile: 'assets-v2/vid/mobile/02-roof-loop.mp4',
      scroll: 2.4,
      linger: 0.4,
      accent: '#0066CC',
      eyebrow: 'Sleek Design & Sunrun Elegance',
      title: 'Sleek Front Skirt & Sunrun Shine',
      body: 'Flush all-black solar panels framed by a custom aerodynamic front skirt trim that conceals all mounting brackets for a luxury finish. As the sun sweeps overhead, the Sunrun mark gleams across the glass.',
      tags: ['Sleek Front Skirt', 'Sunrun Brand Shine', '25-Year Warranty']
    },
    {
      id: 'battery',
      label: 'Powerwall',
      still: 'assets-v2/stills/03-battery.webp',
      stillMobile: 'assets-v2/stills/03-battery-m.webp',
      clip: 'assets-v2/vid/encoded/03-battery-loop.mp4',
      clipMobile: 'assets-v2/vid/mobile/03-battery-loop.mp4',
      scroll: 2.4,
      linger: 0.4,
      accent: '#10B981',
      eyebrow: 'Tesla Powerwall Battery',
      title: 'Store Sunlight for When You Need It',
      body: 'Your Tesla Powerwall captures excess solar energy during the day and stores it for nighttime use, blackouts, or peak rate hours — giving you true energy independence.',
      tags: ['13.5 kWh Capacity', 'Blackout Protection', 'Peak Rate Savings']
    },
    {
      id: 'home',
      label: 'Home',
      still: 'assets-v2/stills/04-home.webp',
      stillMobile: 'assets-v2/stills/04-home-m.webp',
      clip: 'assets-v2/vid/encoded/04-home-loop.mp4',
      clipMobile: 'assets-v2/vid/mobile/04-home-loop.mp4',
      scroll: 2.4,
      linger: 0.4,
      accent: '#FFF8F0',
      eyebrow: 'Nighttime Power & EV Charging',
      title: 'From Powerwall to Home & EV',
      body: 'After sunset, your Tesla Powerwalls send the energy they stored during the day back into your home, keeping the lights on, the A/C running, and your EV charging through a Level 2 wall connector.',
      tags: ['Nighttime Discharge', 'Level 2 EV Charging', 'Whole-Home Backup']
    },
    {
      id: 'community',
      label: 'Community',
      still: 'assets-v2/stills/05-community.webp',
      stillMobile: 'assets-v2/stills/05-community-m.webp',
      clip: 'assets-v2/vid/encoded/05-community-loop.mp4',
      clipMobile: 'assets-v2/vid/mobile/05-community-loop.mp4',
      scroll: 2.4,
      linger: 0.4,
      accent: '#4CAF50',
      eyebrow: 'Gas-Genie Fuel Rewards',
      title: 'Gas Credits Straight to Your Wallet',
      body: 'Clean solar that pays at the pump. Earn monthly Gas-Genie fuel credits and utility cashback deposited directly into your digital wallet, putting cash back into customer pockets every month.',
      tags: ['Gas Credits in Wallet', 'Monthly Fuel Savings', 'Utility Cash Back']
    },
    {
      id: 'cta',
      label: 'Get Started',
      still: 'assets-v2/stills/06-cta.webp',
      stillMobile: 'assets-v2/stills/06-cta-m.webp',
      clip: 'assets-v2/vid/encoded/06-cta-loop.mp4',
      clipMobile: 'assets-v2/vid/mobile/06-cta-loop.mp4',
      accent: '#FF6B00',
      eyebrow: 'Energy Independence',
      title: 'Your Zero-Down Solar Sanctuary',
      body: 'Own your power with $0 down Sunrun solar + Tesla Powerwall battery storage. Charge your EV on sunlight, enjoy 24/7 whole-home backup, and earn monthly gas credits.',
      tags: ['Zero Down', 'Tesla Powerwall Included', 'Gas Credits Active'],
      cta: {
        primary: { label: 'Book a free consultation', href: '/book' },
        secondary: { label: 'Meet your solar advisor', href: '#quote' },
      }
    }
  ],
  connectors: [],
  connectorsMobile: []
};

// Main application component
export default function App() {
  const [source, setSource] = useState<string | null>(null);
  const [view, setView] = useState<MarketingView>(() =>
    marketingViewFromLocation(window.location.pathname, window.location.search),
  );
  // Mount the third-party form only when the visitor explicitly requests it.
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

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('quote-in-view', quoteInView);
    root.classList.toggle('pg-mobile-cta', view === 'journey' && !quoteInView);
    root.dataset.pgBrand = assistantBrandFromView(view);
    return () => {
      root.classList.remove('quote-in-view', 'pg-mobile-cta');
    };
  }, [quoteInView, view]);

  const triggerToast = (message?: string, submessage?: string) => {
    if (!message) return;
    setToast({ isVisible: true, message, submessage });

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
          onNavigateBrands={() => handleNavigate('brands')}
        />
      </main>

      {/* Mobile Fixed CTA. Hidden once the quote is on screen so it does not cover the form. */}
      {!quoteInView && (
      <div className="sm:hidden fixed z-60 left-4 right-4 bottom-[max(12px,env(safe-area-inset-bottom))] pointer-events-none">
        <a 
          href="/book"
          className="quote-cta-mobile flex items-center justify-center gap-2.5 min-h-[52px] w-full bg-[#1A1A2E] text-white font-bold rounded-full shadow-[0_10px_25px_rgba(26,26,46,0.35)] hover:bg-[#262642] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200 pointer-events-auto no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2"
        >
          <Calendar className="w-5 h-5 text-[#FF8A2B]" aria-hidden="true" />
          <span>Book a free consultation</span>
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
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF6B00]/10 border border-[#FF6B00]/20 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B00] animate-pulse" aria-hidden="true" />
          <p className="quote-panel__eyebrow m-0 text-[0.72rem] font-bold tracking-[0.14em] uppercase text-[#FF6B00]">Your free quote</p>
        </div>
        <h2 id="quote-title" className="m-0 mb-4 text-[#1A1A2E] font-bold text-[clamp(1.85rem,3.8vw,2.8rem)] tracking-tight leading-[1.08]">Let's power your home.</h2>
        <div className="mb-7">
          <button
            type="button"
            data-testid="book-consult"
            onClick={() => { window.location.href = '/book'; }}
            className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-full bg-[#FF6B00] text-white font-bold shadow-[0_8px_20px_rgba(255,107,0,0.28)] hover:bg-[#FF8A2B] hover:shadow-[0_12px_28px_rgba(255,107,0,0.38)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F6F7FB]"
          >
            <Calendar className="w-4 h-4 text-white" aria-hidden="true" />
            <span>Book a free consultation</span>
          </button>
        </div>
        <div className="quote-panel__grid grid grid-cols-1 md:grid-cols-[minmax(280px,360px)_1fr] gap-[clamp(20px,3vw,40px)] items-start max-w-[1280px]">
          <aside className="rep-card relative overflow-hidden bg-[#0B2233] text-[#F7FBFF] rounded-[22px] p-[28px_26px] shadow-[0_16px_40px_rgba(10,20,40,0.22)] border border-white/10" aria-label="Your Sunrun solar expert">
            <div className="absolute top-0 right-0 w-36 h-36 bg-[radial-gradient(circle_at_100%_0%,rgba(255,107,0,0.18),transparent_70%)] pointer-events-none" />
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#FF6B00]/15 text-[#FF8A2B] border border-[#FF6B00]/30">
                <Sparkles className="w-3 h-3 text-[#FF8A2B]" aria-hidden="true" />
                Sunrun Expert Lead
              </span>
            </div>
            <p className="rep-card__name m-0 text-[1.4rem] font-bold tracking-tight text-white">Horace Lawrence</p>
            <p className="rep-card__role m-0 mt-1 mb-[18px] text-[0.88rem] text-[#A9C1D6]">The Block Sales Expert Team Lead · Sunrun</p>
            <ul className="rep-card__contact grid gap-2 m-0 mb-5 p-0 list-none">
              <li>
                <a href="mailto:horace.lawrence@sunrun.com" className="inline-flex items-center gap-[10px] text-white font-semibold text-[0.95rem] no-underline break-all px-2.5 py-1.5 -mx-2.5 rounded-lg hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A2B]">
                  <Mail className="flex-none w-[18px] h-[18px] text-[#FF8A2B]" />
                  horace.lawrence@sunrun.com
                </a>
              </li>
              <li>
                <a href="tel:+15102417007" className="inline-flex items-center gap-[10px] text-white font-semibold text-[0.95rem] no-underline break-all px-2.5 py-1.5 -mx-2.5 rounded-lg hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A2B]">
                  <Phone className="flex-none w-[18px] h-[18px] text-[#FF8A2B]" />
                  510-241-7007
                </a>
              </li>
            </ul>
            <p className="rep-card__intro m-0 mb-[14px] text-[0.95rem] leading-[1.55] text-[#D9E6F2]">Hi, I'm Horace! I'm dedicated to making the process of going solar as easy as possible. Why solar?</p>
            <ul className="rep-card__why grid gap-[12px] m-0 p-0 list-none">
              <li className="relative pl-[26px] text-[0.92rem] leading-[1.45] text-[#F7FBFF] before:content-[''] before:absolute before:left-0 before:top-[0.32em] before:w-[14px] before:h-[14px] before:rounded-full before:bg-[#FF6B00] before:shadow-[inset_0_0_0_4px_#0B2233]">Lock in a rate to avoid rising utility costs.</li>
              <li className="relative pl-[26px] text-[0.92rem] leading-[1.45] text-[#F7FBFF] before:content-[''] before:absolute before:left-0 before:top-[0.32em] before:w-[14px] before:h-[14px] before:rounded-full before:bg-[#FF6B00] before:shadow-[inset_0_0_0_4px_#0B2233]">A more reliable source of energy for your home.</li>
              <li className="relative pl-[26px] text-[0.92rem] leading-[1.45] text-[#F7FBFF] before:content-[''] before:absolute before:left-0 before:top-[0.32em] before:w-[14px] before:h-[14px] before:rounded-full before:bg-[#FF6B00] before:shadow-[inset_0_0_0_4px_#0B2233]">With a battery, protection during blackouts.</li>
            </ul>
          </aside>
          <div className="quote-panel__formwrap bg-white rounded-[22px] overflow-hidden border border-[#1A1A2E]/8 shadow-[0_16px_40px_rgba(10,20,40,0.1)]">
            {formReady ? (
              <iframe
                className="quote-panel__frame block w-full h-[min(900px,82vh)] border-0 bg-white"
                title="Sunrun quote request form"
                src={getSalesforceUrl("https://sunrun.my.salesforce-sites.com/purl/?srep=/powergenie#form-group")}
                referrerPolicy="strict-origin-when-cross-origin"
              ></iframe>
            ) : (
              <div className="quote-panel__frame flex flex-col w-full min-h-[260px] p-6 text-center items-center justify-center gap-3 bg-white text-[0.95rem] text-[#4A5568]">
                <h3 className="text-xl font-bold text-[#1A1A2E]">Choose your next step</h3>
                <p>Book a free consultation with Horace. Your electric bill is optional when booking.</p>
                <a href="/book" className="rounded-full bg-[#1A1A2E] px-6 py-3 font-semibold text-white">Choose a consultation time</a>
                <button type="button" onClick={() => setFormReady(true)} className="min-h-11 font-semibold text-[#0066CC] underline">Or load the Sunrun quote form</button>
              </div>
            )}
            <p className="quote-panel__alt m-0 p-[14px_20px] text-[0.88rem] text-[#4A5568] bg-[#FAFAFC] border-t border-[rgba(26,26,46,0.06)] flex items-center justify-between flex-wrap gap-2">
              <span>Prefer Sunrun’s website?</span>
              <a href={getSalesforceUrl("https://sunrun.my.salesforce-sites.com/purl/?srep=/powergenie")} target="_blank" rel="noopener" className="text-[#0066CC] font-semibold hover:underline inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC] rounded">
                <span>Open it in a new tab</span>
                <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            </p>
          </div>
        </div>
        <div className="mt-8 max-w-[1280px]">
          <a
            href="/book"
            className="group inline-flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-white border border-[#1A1A2E]/8 shadow-[0_4px_16px_rgba(10,20,40,0.06)] hover:border-[#0066CC]/30 hover:shadow-[0_8px_24px_rgba(0,102,204,0.12)] hover:-translate-y-0.5 transition-all duration-200 no-underline text-[#1A1A2E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC] focus-visible:ring-offset-2"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[#0066CC]/10 text-[#0066CC] group-hover:bg-[#0066CC] group-hover:text-white transition-colors">
              <Calendar className="w-4 h-4" aria-hidden="true" />
            </span>
            <span className="font-semibold text-[0.95rem] text-[#0066CC] group-hover:underline">
              Book a one-hour call on Horace’s calendar
            </span>
            <ArrowUpRight className="w-4 h-4 text-[#0066CC] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" aria-hidden="true" />
          </a>
        </div>
        <section className="mt-10 max-w-[900px] space-y-4" aria-labelledby="solar-questions">
          <h2 id="solar-questions" className="text-2xl font-bold">Before your consultation</h2>
          {[
            ['What happens on the call?', 'Horace will review your goals, electricity use, and roof, then discuss solar and battery options tailored to your home.'],
            ['Do I need my electric bill?', 'You can book without it. A recent bill can help prepare your assessment. Bill upload and meter access are optional.'],
            ['Will a battery power everything during an outage?', 'Backup depends on system design, battery capacity, available charge, and the appliances you run. Discuss the circuits you want to protect with Horace.'],
            ['How much could I save?', 'Your assessment depends on electricity use, roof conditions, utility rates, and the plan you choose. Ask for the assumptions and payment terms behind any estimate.'],
          ].map(([question, answer]) => (
            <details key={question} className="rounded-xl border border-[#1A1A2E]/10 bg-white p-5">
              <summary className="cursor-pointer font-semibold">{question}</summary>
              <p className="mt-3 leading-relaxed text-[#4A5568]">{answer}</p>
            </details>
          ))}
          <button type="button" onClick={() => openAssistant('bill')} className="min-h-11 font-semibold text-[#0066CC] underline">Already preparing? Upload your electric bill</button>
        </section>
        <LegalFooter homeChrome />
      </section>
    </div>
  );
}
