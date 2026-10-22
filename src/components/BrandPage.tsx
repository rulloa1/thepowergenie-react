import React from 'react';
import { openAssistant } from '../lib/openAssistant';
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

export default function BrandPage({ id, onNavigate, getSalesforceUrl, onQuoteClick }: BrandPageProps) {
  if (id === 'brands') {
    return (
      <div className="min-h-screen bg-[#071b27] text-[#f4f8fb] font-sans selection:bg-[#a7e6ff] selection:text-[#071b27]">
        <Header onNavigate={onNavigate} />
        <main>
          <section className="px-[7vw] pt-20 pb-16 max-w-[1100px]">
            <p className="text-[11px] font-bold tracking-[2px] text-[#f6cf85] uppercase">THE POWER GENIE FAMILY</p>
            <h1 className="text-[clamp(42px,6.4vw,88px)] leading-[1.03] tracking-[-0.055em] font-semibold my-[22px]">Different energy.<br />Connected by possibility.</h1>
            <p className="text-lg text-[#bacbd6] max-w-[600px] mb-8">Find your way into The Power Genie world. Explore our brands, discover solar for your home, and choose your next step.</p>
            <button onClick={() => onNavigate('journey')} className="inline-flex items-center min-h-[44px] text-sm border-b border-[#ffffff55] hover:border-white transition-colors cursor-pointer">
              Start The Power Genie solar journey ↗
            </button>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-[18px] px-[7vw]" aria-label="Choose a brand">
            <BrandCard 
              id="celebrity-solar" 
              kicker="01 / THE SPOTLIGHT" 
              title="Celebrity Solar" 
              body="A brighter home deserves the spotlight. Explore solar and battery options through The Power Genie." 
              accent="#edcd8b"
              onClick={() => onNavigate('celebrity-solar')}
            />
            <BrandCard 
              id="hip-hop-solar" 
              kicker="02 / THE CULTURE" 
              title="Hip-Hop Solar" 
              body="Bring a new perspective to how you power your home. Discover solar and storage through The Power Genie." 
              accent="#c0f477"
              onClick={() => onNavigate('hip-hop-solar')}
            />
            <BrandCard 
              id="gas-genie" 
              kicker="03 / WHAT’S NEXT" 
              title="Gas Genie" 
              body="A new part of The Power Genie family is taking shape." 
              accent="#95dbe9"
              onClick={() => onNavigate('gas-genie')}
            />
          </section>

          <section className="px-[7vw] pt-20 pb-16 max-w-[1100px]">
            <p className="text-[11px] font-bold tracking-[2px] text-[#f6cf85] uppercase">ONE CONNECTED JOURNEY</p>
            <h2 className="text-[clamp(28px,3.3vw,46px)] leading-[1.12] tracking-[-0.045em] font-semibold mt-4">Your home is where it starts.</h2>
            <p className="text-[#bacbd6] my-6">Celebrity Solar and Hip-Hop Solar connect you to The Power Genie’s solar inquiry experience. Gas Genie is coming soon.</p>
            <button onClick={() => onNavigate('journey')} className="inline-flex justify-center items-center bg-[#f6cf85] text-[#102029] text-sm font-bold px-6 min-h-[48px] rounded-full hover:brightness-110 transition-all cursor-pointer">
              Explore The Power Genie
            </button>
          </section>
        </main>
        <Footer onNavigate={onNavigate} />
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
      <Header onNavigate={onNavigate} />
      <main>
        <section className="relative isolation-auto min-h-[78svh] flex items-end px-[7vw] pt-24 pb-24 overflow-hidden">
          <img className="absolute inset-0 w-full h-full object-cover z-[-2]" src={content.image} alt="" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#071b27f5,#071b27cb_40%,#071b2744)] z-[-1]" />
          <div className="max-w-[780px]">
            <button onClick={() => onNavigate('brands')} className="inline-block text-xs text-[#d1e0e8] mb-7 min-h-[32px] hover:text-white transition-colors cursor-pointer">
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
                  className="inline-flex justify-center items-center bg-[var(--accent)] text-[#102029] text-sm font-bold px-6 min-h-[48px] rounded-full hover:brightness-110 transition-all no-underline"
                  style={{ '--accent': content.accent } as any}
                >
                  Explore my solar options ↗
                </a>
              ) : (
                <button 
                  onClick={() => onNavigate('brands')}
                  className="inline-flex justify-center items-center bg-[var(--accent)] text-[#102029] text-sm font-bold px-6 min-h-[48px] rounded-full hover:brightness-110 transition-all cursor-pointer"
                  style={{ '--accent': content.accent } as any}
                >
                  Explore the brand family
                </button>
              )}
              <button
                type="button"
                onClick={() => openAssistant('book')}
                className="inline-flex justify-center items-center border border-white/40 text-sm font-bold px-6 min-h-[48px] rounded-full hover:bg-white/10 transition-all cursor-pointer"
              >
                Book a free savings consult
              </button>
              <button 
                onClick={() => onNavigate('journey')}
                className="inline-flex items-center min-h-[44px] text-sm border-b border-[#ffffff55] hover:border-white transition-colors cursor-pointer"
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

function Header({ onNavigate }: { onNavigate: (v: string) => void }) {
  return (
    <header className="flex items-center justify-between gap-5 px-[5vw] py-[18px] border-b border-[#ffffff20] bg-[#071b27]">
      <button onClick={() => onNavigate('journey')} className="flex items-center gap-[10px] font-semibold text-xl tracking-[-0.6px] bg-transparent border-0 text-inherit p-0 cursor-pointer">
        <img src="assets/brand/power-genie-lockup.webp" alt="The Power Genie" className="h-10 w-auto aspect-[647/180] object-contain max-md:h-8" />
      </button>
      <nav aria-label="Brand navigation" className="flex gap-6 text-sm max-md:gap-3 max-md:text-xs">
        <span
          role="link"
          aria-disabled="true"
          className="inline-flex items-center gap-2 min-h-[44px] cursor-not-allowed select-none text-[#8aa0ad]"
        >
          Our brands
          <span className="inline-flex shrink-0 items-center rounded-full border border-[#FF6B0055] bg-[#FF6B0018] px-2 py-[3px] text-[0.62rem] font-semibold leading-none tracking-[0.04em] text-[#FFB07A]">
            Coming soon
          </span>
        </span>
        <button onClick={() => onNavigate('journey')} className="md:flex hidden items-center min-h-[44px] bg-transparent border-0 text-inherit p-0 cursor-pointer hover:text-[#f6cf85] transition-colors">Explore solar ↗</button>
      </nav>
    </header>
  );
}

function BrandCard({ id, kicker, title, body, accent, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col text-left min-h-[350px] p-8 border border-[#ffffff24] bg-[linear-gradient(145deg,#ffffff08,transparent)] rounded-[22px] transition-all hover:-translate-y-1.25 hover:border-[var(--accent)] cursor-pointer group"
      style={{ '--accent': accent } as any}
    >
      <span className="text-[11px] font-bold tracking-[2px] text-[var(--accent)] uppercase">{kicker}</span>
      <h2 className="mt-10 mb-2.5 text-[clamp(28px,3.3vw,46px)] leading-[1.12] tracking-[-0.045em] font-semibold text-[var(--accent)] group-hover:brightness-110">{title}</h2>
      <p className="text-[#bacbd6] text-[15px] leading-[1.65] mb-6">{body}</p>
      <span className="flex justify-between mt-auto text-sm">
        Explore {title} <span aria-hidden="true">↗</span>
      </span>
    </button>
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
    <footer className="flex flex-wrap justify-between gap-6 mx-[7vw] py-8 border-t border-[#ffffff25] text-[13px] text-[#bacbd6]">
      <button onClick={() => onNavigate('journey')} className="bg-transparent border-0 text-inherit p-0 cursor-pointer hover:text-white">The Power Genie</button>
      <span>One connected energy journey.</span>
      <button onClick={() => onNavigate('brands')} className="bg-transparent border-0 text-inherit p-0 cursor-pointer hover:text-white">Explore all brands</button>
    </footer>
  );
}
