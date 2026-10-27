import React from 'react';
import { openAssistant } from '../lib/openAssistant';
import { shouldHandleClientNavigation } from '../lib/siteRoutes';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BrandPageProps {
  id: 'brands' | 'celebrity-solar' | 'hip-hop-solar' | 'gas-genie';
  onNavigate: (view: string) => void;
  getSalesforceUrl: (baseUrl: string) => string;
  onQuoteClick?: (msg?: string, sub?: string) => void;
}

/** Public file URL, prefixed with Vite's base (usually "/"). */
function publicPath(path: string) {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}${path.replace(/^\//, '')}`
}

/** Updated Power Genie lockup. The family index keeps this; each brand page uses its own. */
const POWER_GENIE_LOCKUP = {
  src: 'assets/brand/power-genie-lockup.webp',
  alt: 'The Power Genie',
  width: 647,
  height: 180,
} as const

// These live outside /assets/brand so the dashboard rewrite for that folder does not 404 them.
const BRAND_LOCKUPS = {
  'celebrity-solar': {
    src: publicPath('brand-lockups/celebrity-solar-lockup.webp'),
    alt: 'Celebrity Solar',
    width: 407,
    height: 234,
  },
  'hip-hop-solar': {
    src: publicPath('brand-lockups/hip-hop-solar-lockup.webp'),
    alt: 'Hip-Hop Solar',
    width: 363,
    height: 237,
  },
  'gas-genie': {
    src: publicPath('brand-lockups/gas-genie-lockup.webp'),
    alt: 'Gas Genie',
    width: 387,
    height: 241,
  },
} as const

export default function BrandPage({ id, onNavigate, getSalesforceUrl, onQuoteClick }: BrandPageProps) {
  if (id === 'brands') {
    return (
      <div className="relative min-h-screen bg-[#071b27] text-[#f4f8fb] font-sans selection:bg-[#a7e6ff] selection:text-[#071b27] overflow-x-hidden">
        {/* Full-screen Background Image & Atmospheric Energy Graphics */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <img
            src="assets/stills/06-cta.webp"
            alt=""
            fetchPriority="high"
            decoding="async"
            className="w-full h-full object-cover object-center opacity-30 scale-105 filter blur-[1px]"
          />
          {/* Luminous Brand Accent Radiant Orbs */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(246,207,133,0.22)_0%,transparent_70%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_35%,rgba(192,244,119,0.16)_0%,transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_65%,rgba(149,219,233,0.15)_0%,transparent_60%)]" />
          {/* Cyber-Solar Geometric Vector Grid */}
          <div className="absolute inset-0 opacity-[0.09] bg-[linear-gradient(to_right,#ffffff20_1px,transparent_1px),linear-gradient(to_bottom,#ffffff20_1px,transparent_1px)] bg-[size:4.5rem_4.5rem]" />
          {/* Dark luxury gradient scrim for high-contrast legibility */}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,27,39,0.76)_0%,rgba(7,27,39,0.88)_40%,#071b27_96%)]" />
        </div>

        <div className="relative z-10">
          <Header onNavigate={onNavigate} brandsCurrent />
          <main>
            <section className="px-[7vw] pt-20 pb-16 max-w-[1100px]">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[11px] font-bold tracking-[2px] text-[#f6cf85] uppercase mb-5">
                <span className="w-2 h-2 rounded-full bg-[#f6cf85] animate-pulse" />
                THE POWER GENIE FAMILY
              </div>
              <h1 className="text-[clamp(42px,6.4vw,88px)] leading-[1.03] tracking-[-0.055em] font-semibold my-[18px] drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
                Different energy.<br />Connected by possibility.
              </h1>
              <p className="text-lg text-[#bacbd6] max-w-[620px] mb-8 leading-relaxed drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
                Find your way into The Power Genie world. Explore our brands, discover solar for your home, and choose your next step.
              </p>
              <button
                onClick={() => onNavigate('journey')}
                className="inline-flex items-center gap-2 min-h-[44px] text-sm text-[#f4f8fb] border-b border-[#ffffff55] hover:border-[#f6cf85] hover:text-[#f6cf85] transition-all cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6cf85] focus-visible:ring-offset-2 focus-visible:ring-offset-[#071b27] rounded-sm"
              >
                <span>Start The Power Genie solar journey</span>
                <span className="text-base">↗</span>
              </button>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-[22px] px-[7vw]" aria-label="Choose a brand">
              <BrandCard 
                href="/celebrity-solar"
                kicker="01 / THE SPOTLIGHT" 
                title="Celebrity Solar" 
                body="A brighter home deserves the spotlight. Explore solar and battery options through The Power Genie." 
                accent="#edcd8b"
                image="assets/stills/04-home.webp"
                lockup={BRAND_LOCKUPS['celebrity-solar']}
                badge="Luxury Living"
                onClick={() => onNavigate('celebrity-solar')}
              />
              <BrandCard 
                href="/hip-hop-solar"
                kicker="02 / THE CULTURE" 
                title="Hip-Hop Solar" 
                body="Bring a new perspective to how you power your home. Discover solar and storage through The Power Genie." 
                accent="#c0f477"
                image="assets/stills/05-community.webp"
                lockup={BRAND_LOCKUPS['hip-hop-solar']}
                badge="Community Power"
                onClick={() => onNavigate('hip-hop-solar')}
              />
              <BrandCard 
                href="/gas-genie"
                kicker="03 / WHAT’S NEXT" 
                title="Gas Genie" 
                body="A new part of The Power Genie family is taking shape. Clean energy transitions for the next generation." 
                accent="#95dbe9"
                image="assets/stills/03-battery.webp"
                lockup={BRAND_LOCKUPS['gas-genie']}
                badge="Coming Soon"
                onClick={() => onNavigate('gas-genie')}
              />
            </section>

            <section className="px-[7vw] pt-24 pb-20 max-w-[1100px]">
              <div className="relative rounded-3xl p-8 sm:p-12 overflow-hidden border border-white/15 bg-white/5 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
                <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full bg-[radial-gradient(circle,rgba(246,207,133,0.18)_0%,transparent_70%)] pointer-events-none" />
                <p className="text-[11px] font-bold tracking-[2px] text-[#f6cf85] uppercase">ONE CONNECTED JOURNEY</p>
                <h2 className="text-[clamp(28px,3.3vw,46px)] leading-[1.12] tracking-[-0.045em] font-semibold mt-4">Your home is where it starts.</h2>
                <p className="text-[#bacbd6] my-6 max-w-[640px] text-base leading-relaxed">
                  Celebrity Solar and Hip-Hop Solar connect you to The Power Genie’s solar inquiry experience. Discover customized savings, Tesla Powerwall storage, and seamless Sunrun installation.
                </p>
                <button
                  onClick={() => onNavigate('journey')}
                  className="inline-flex justify-center items-center bg-[#f6cf85] text-[#102029] text-sm font-bold px-7 min-h-[48px] rounded-full hover:brightness-110 shadow-[0_4px_20px_rgba(246,207,133,0.35)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6cf85] focus-visible:ring-offset-2 focus-visible:ring-offset-[#071b27]"
                >
                  Explore The Power Genie
                </button>
              </div>
            </section>
          </main>
          <Footer onNavigate={onNavigate} />
        </div>
      </div>
    );
  }

  const contentMap: Record<string, {
    title: string;
    intro: string;
    image: string;
    kicker: string;
    accent: string;
    story: string;
    body: string;
    status?: string;
  }> = {
    'celebrity-solar': {
      title: 'Your home.\nIn a new light.',
      intro: 'A brighter home deserves the spotlight. Explore solar and battery options through The Power Genie.',
      image: 'assets/stills/04-home.webp',
      kicker: 'Celebrity Solar',
      accent: '#edcd8b',
      story: 'Solar, with presence.',
      body: 'Start with your home, your energy needs, and a conversation about what solar could look like for you.'
    },
    'hip-hop-solar': {
      title: 'New energy.\nYour rhythm.',
      intro: 'Bring a new perspective to how you power your home. Discover solar and storage through The Power Genie.',
      image: 'assets/stills/05-community.webp',
      kicker: 'Hip-Hop Solar',
      accent: '#c0f477',
      story: 'Make your next move.',
      body: 'From the roof to the battery, explore how the pieces connect—then take the next step with a personalized solar quote.'
    },
    'gas-genie': {
      title: 'More possibilities.\nOne Genie family.',
      intro: 'A new part of The Power Genie family is taking shape.',
      image: 'assets/stills/03-battery.webp',
      kicker: 'Gas Genie',
      accent: '#95dbe9',
      story: 'Stay connected.',
      body: 'Gas Genie service details and enrollment are not available yet. You can explore The Power Genie family or discover the solar journey today.',
      status: 'Coming soon'
    }
  };

  const content = contentMap[id as keyof typeof contentMap];

  return (
    <div className={cn("min-h-screen bg-[#071b27] text-[#f4f8fb] font-sans selection:bg-[#a7e6ff] selection:text-[#071b27]", id)}>
      <Header onNavigate={onNavigate} lockup={BRAND_LOCKUPS[id]} />
      <main>
        <section className="relative isolation-auto min-h-[78svh] flex items-end px-[7vw] pt-24 pb-24 overflow-hidden">
          <img
            className="absolute inset-0 w-full h-full object-cover z-[-2]"
            src={content.image}
            alt=""
            fetchPriority="high"
            decoding="async"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#071b27f5,#071b27cb_40%,#071b2744)] z-[-1]" />
          <div className="max-w-[780px]">
            <button onClick={() => onNavigate('brands')} className="inline-block text-xs text-[#d1e0e8] mb-7 min-h-[32px] hover:text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded px-1 -mx-1">
              ← The Power Genie family
            </button>
            <p className="text-[11px] font-bold tracking-[2px] text-[var(--accent)] uppercase" style={{ '--accent': content.accent } as any}>
              {content.kicker} / THE POWER GENIE
            </p>
            <h1 className="text-[clamp(42px,6.4vw,88px)] leading-[1.03] tracking-[-0.055em] font-semibold my-[22px] whitespace-pre-line">
              {content.title}
            </h1>
            <p className="text-lg text-[#bacbd6] max-w-[600px]">
              {content.intro}
            </p>
            
            {content.status && (
              <span className="inline-block border border-[var(--accent)] text-[var(--accent)] px-3.5 py-2 rounded-full text-xs mt-3" style={{ '--accent': content.accent } as any}>
                {content.status}
              </span>
            )}

            <div className="flex items-center flex-wrap gap-5 mt-7">
              {id !== 'gas-genie' ? (
                <a 
                  href={getSalesforceUrl(`https://sunrun.my.salesforce-sites.com/purl/?srep=/powergenie&utm_source=${id}`)}
                  onClick={() => onQuoteClick?.("Wonderful!", "Taking you to our personalized inquiry form.")}
                  className="inline-flex justify-center items-center bg-[var(--accent)] text-[#102029] text-sm font-bold px-6 min-h-[48px] rounded-full hover:brightness-110 shadow-[0_4px_20px_color-mix(in_srgb,var(--accent)_35%,transparent)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#071b27]"
                  style={{ '--accent': content.accent } as any}
                >
                  Explore my solar options ↗
                </a>
              ) : (
                <button 
                  onClick={() => onNavigate('brands')}
                  className="inline-flex justify-center items-center bg-[var(--accent)] text-[#102029] text-sm font-bold px-6 min-h-[48px] rounded-full hover:brightness-110 shadow-[0_4px_20px_color-mix(in_srgb,var(--accent)_35%,transparent)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#071b27]"
                  style={{ '--accent': content.accent } as any}
                >
                  Explore the brand family
                </button>
              )}
              <button
                type="button"
                onClick={() => openAssistant('book')}
                className="inline-flex justify-center items-center border border-white/40 text-sm font-bold px-6 min-h-[48px] rounded-full hover:bg-white/10 hover:border-white hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#071b27]"
              >
                Book a free savings consult
              </button>
              <button 
                onClick={() => onNavigate('journey')}
                className="inline-flex items-center min-h-[44px] text-sm border-b border-[#ffffff55] hover:border-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#071b27] rounded-sm"
              >
                {id === 'gas-genie' ? 'Explore solar with The Power Genie ↗' : 'Take the solar journey'}
              </button>
            </div>
            <p className="text-xs max-w-[440px] text-[#c8d9e3] mt-4">Continue to The Power Genie’s Sunrun referral page for your solar inquiry.</p>
          </div>
        </section>

        <section className="px-[7vw] py-20 max-w-[1400px]">
          <p className="text-[11px] font-bold tracking-[2px] text-[var(--accent)] uppercase" style={{ '--accent': content.accent } as any}>{content.kicker}</p>
          <h2 className="text-[clamp(28px,3.3vw,46px)] leading-[1.12] tracking-[-0.045em] font-semibold mt-4">{content.story}</h2>
          <p className="max-w-[700px] text-[#bacbd6] leading-[1.65] mt-4">{content.body}</p>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-7 mt-14" aria-label="Your next steps">
            <Step number="01" title="Explore" body="See how solar panels, storage, and your home connect." accent={content.accent} />
            <Step number="02" title="Start a conversation" body="Continue to The Power Genie referral page to ask about options for your home." accent={content.accent} />
            <Step number="03" title="Review your options" body="Confirm availability, costs, and terms before making a decision." accent={content.accent} />
          </section>
          
          {id === 'gas-genie' && (
             <p className="text-xs max-w-[440px] text-[#c8d9e3] mt-8">Solar inquiries go to The Power Genie’s Sunrun referral page. This is not Gas Genie enrollment.</p>
          )}
        </section>
      </main>
      <Footer onNavigate={onNavigate} />
    </div>
  );
}

function Header({
  onNavigate,
  lockup,
  brandsCurrent = false,
}: {
  onNavigate: (v: string) => void;
  /** Brand lockup. Omitted on the family index, which keeps the Power Genie logo. */
  lockup?: (typeof BRAND_LOCKUPS)[keyof typeof BRAND_LOCKUPS];
  brandsCurrent?: boolean;
}) {
  const logo = lockup ?? POWER_GENIE_LOCKUP
  return (
    <header className={cn(
      'flex items-center justify-between border-b border-[#ffffff20] bg-[#071b27]',
      lockup ? 'gap-3 px-4 py-3 sm:gap-5 sm:px-[5vw]' : 'gap-5 px-[5vw] py-[18px]',
    )}>
      <button onClick={() => onNavigate('journey')} className="flex shrink-0 items-center gap-[10px] bg-transparent border-0 p-0 font-semibold text-xl tracking-[-0.6px] text-inherit cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6cf85] rounded-xl">
        <img
          src={logo.src}
          alt={logo.alt}
          width={logo.width}
          height={logo.height}
          fetchPriority="high"
          decoding="async"
          className={
            lockup
              ? 'block h-20 w-auto shrink-0 object-contain max-sm:h-14'
              : 'h-10 w-auto aspect-[647/180] object-contain max-md:h-8'
          }
        />
      </button>
      <nav aria-label="Brand navigation" className={cn(
        'flex items-center gap-6 text-sm max-md:gap-3 max-md:text-xs',
        lockup && 'shrink-0 whitespace-nowrap',
      )}>
        <a
          href="/brands"
          aria-current={brandsCurrent ? 'page' : undefined}
          onClick={(event) => {
            if (!shouldHandleClientNavigation(event)) return;
            event.preventDefault();
            onNavigate('brands');
          }}
          className="inline-flex items-center min-h-[44px] bg-transparent text-inherit no-underline cursor-pointer hover:text-[#f6cf85] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6cf85] rounded-lg px-2"
        >
          Our brands
        </a>
        <button onClick={() => onNavigate('journey')} className="md:flex hidden items-center min-h-[44px] bg-transparent border-0 text-inherit p-0 cursor-pointer hover:text-[#f6cf85] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6cf85] rounded-lg px-2">Explore solar ↗</button>
      </nav>
    </header>
  );
}

function BrandCard({
  href,
  kicker,
  title,
  body,
  accent,
  image,
  lockup,
  badge,
  onClick,
}: {
  href: string;
  kicker: string;
  title: string;
  body: string;
  accent: string;
  image?: string;
  lockup?: (typeof BRAND_LOCKUPS)[keyof typeof BRAND_LOCKUPS];
  badge?: string;
  onClick: () => void;
}) {
  return (
    <a
      href={href}
      onClick={(event) => {
        if (!shouldHandleClientNavigation(event)) return;
        event.preventDefault();
        onClick();
      }}
      className="group relative flex flex-col text-left text-inherit no-underline min-h-[420px] p-8 border border-white/15 rounded-[26px] overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:border-[var(--accent)] hover:shadow-[0_22px_50px_rgba(0,0,0,0.6)] active:scale-[0.99] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#071b27]"
      style={{ '--accent': accent } as React.CSSProperties}
    >
      {/* Full-bleed Card Background Image */}
      {image && (
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover object-center filter brightness-[0.68] contrast-[1.08] transition-transform duration-700 ease-out group-hover:scale-110 group-hover:brightness-[0.78]"
          />
          {/* Rich Gradient Scrim for crisp readability */}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,27,39,0.70)_0%,rgba(7,27,39,0.82)_45%,rgba(7,27,39,0.96)_100%)] transition-opacity duration-300 group-hover:opacity-90" />
          {/* Brand Accent Atmospheric Glow */}
          <div
            className="absolute -bottom-16 -right-16 w-52 h-52 rounded-full opacity-30 blur-2xl transition-opacity duration-500 group-hover:opacity-65"
            style={{ backgroundColor: accent }}
          />
        </div>
      )}

      {/* Card Content */}
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold tracking-[2px] text-[var(--accent)] uppercase drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
            {kicker}
          </span>
          {badge && (
            <span
              className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)] backdrop-blur-sm"
            >
              {badge}
            </span>
          )}
        </div>

        {/* Lockup Logo if provided */}
        {lockup ? (
          <div className="mt-7 mb-3 h-16 flex items-center">
            <img
              src={lockup.src}
              alt={lockup.alt}
              className="max-h-14 w-auto object-contain filter drop-shadow-[0_4px_14px_rgba(0,0,0,0.7)] transition-transform duration-300 group-hover:scale-105"
            />
          </div>
        ) : (
          <div className="mt-7" />
        )}

        <h2 className="mb-3 text-[clamp(26px,2.8vw,38px)] leading-[1.12] tracking-[-0.04em] font-semibold text-white group-hover:text-[var(--accent)] transition-colors drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
          {title}
        </h2>

        <p className="text-[#bacbd6] text-[15px] leading-[1.65] mb-6 drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)]">
          {body}
        </p>

        <span className="flex items-center justify-between mt-auto pt-4 border-t border-white/10 text-sm font-semibold text-[var(--accent)] group-hover:translate-x-1 transition-transform">
          <span>Explore {title}</span>
          <span aria-hidden="true" className="text-lg">→</span>
        </span>
      </div>
    </a>
  );
}

function Step({ number, title, body, accent }: any) {
  return (
    <div className="border-t border-[#ffffff33] pt-6">
      <span className="text-[#f6cf85] text-xs font-bold" style={{ color: accent }}>{number}</span>
      <h3 className="font-medium text-[21px] my-2">{title}</h3>
      <p className="text-[#bacbd6] text-[15px] leading-[1.65]">{body}</p>
    </div>
  );
}

function Footer({ onNavigate }: { onNavigate: (v: string) => void }) {
  return (
    <footer className="flex flex-wrap justify-between items-center gap-6 mx-[7vw] py-8 border-t border-[#ffffff25] text-[13px] text-[#bacbd6]">
      <button onClick={() => onNavigate('journey')} className="bg-transparent border-0 text-inherit p-0 cursor-pointer hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6cf85] rounded px-2 py-1">The Power Genie</button>
      <button onClick={() => onNavigate('brands')} className="bg-transparent border-0 text-inherit p-0 cursor-pointer hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f6cf85] rounded px-2 py-1">Explore all brands</button>
    </footer>
  );
}
