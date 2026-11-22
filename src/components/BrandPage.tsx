import React from 'react';
import { openAssistant } from '../lib/openAssistant';
import { shouldHandleClientNavigation } from '../lib/siteRoutes';
import '../styles/brand-pages.css';

interface BrandPageProps {
  id: 'brands' | 'celebrity-solar' | 'hip-hop-solar' | 'gas-genie';
  onNavigate: (view: string) => void;
  getSalesforceUrl: (baseUrl: string) => string;
  onQuoteClick?: (msg?: string, sub?: string) => void;
}

type WorldId = 'celebrity-solar' | 'hip-hop-solar' | 'gas-genie';
type LockupId = 'power-genie' | WorldId | 'sport-and-solar';

type Lockup = { src: string; alt: string; width: number; height: number };

/** Public file URL, prefixed with Vite's base (usually "/"). */
function publicPath(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${path.replace(/^\//, '')}`;
}

/** These live outside /assets/brand so the dashboard rewrite for that folder does not 404 them. */
const LOCKUPS: Record<LockupId, Lockup> = {
  'power-genie': {
    src: 'assets/brand/power-genie-lockup.webp',
    alt: 'The Power Genie',
    width: 647,
    height: 180,
  },
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
  'sport-and-solar': {
    src: publicPath('brand-lockups/sport-and-solar-lockup.svg'),
    alt: 'Sport & Solar',
    width: 400,
    height: 260,
  },
};

type World = {
  name: string;
  title: [string, string];
  sub: string;
  heading: string;
  copy: string[];
  start: { title: string; body: string }[];
  note: string;
  hero: { image: string; alt: string };
  status?: string;
};

const WORLDS: Record<WorldId, World> = {
  'celebrity-solar': {
    name: 'Celebrity Solar',
    title: ['Your home.', 'In a new light.'],
    sub: 'Solar and battery for the Texas home that was always going to be noticed.',
    heading: 'Solar, with presence.',
    copy: [
      'Every solar conversation starts with the building: how the roof faces the sun, how much shade it takes through the afternoon, and how much of the bill a system could actually carry. Then it turns to the life underneath that roof — the rooms you want lit during an outage, the car in the driveway, the August bill that keeps climbing.',
      'The Power Genie is a Sunrun referral. Nothing is designed, priced or signed on this page. You get a free assessment, ask what the numbers mean, and decide on your own schedule.',
    ],
    start: [
      {
        title: 'Send your details',
        body: 'Tell us about the home. An electric bill helps, but it is optional.',
      },
      {
        title: 'Walk the roof',
        body: 'Orientation, shading and usable space, plus the circuits you would want on battery backup.',
      },
      {
        title: 'Read the numbers',
        body: 'Production estimates, payment terms and the assumptions behind them, before anything is decided.',
      },
    ],
    note: 'Solar inquiries continue to The Power Genie’s Sunrun referral page.',
    hero: {
      image: 'assets/stills/04-home.webp',
      alt: 'A stone and glass Texas home lit at dusk, with a car in the driveway.',
    },
  },
  'hip-hop-solar': {
    name: 'Hip-Hop Solar',
    title: ['New energy.', 'Your rhythm.'],
    sub: 'Solar and storage for the homeowner who sets the pace instead of following one.',
    heading: 'Make your next move.',
    copy: [
      'The block already knows what it pays the utility every August. Start there: how much sun the roof gets, how much of the house could run on what it stores, and what that changes when the grid goes down.',
      'Same team and the same referral behind it, different front door. The Power Genie connects you to a Sunrun assessment with no obligation and no pressure — and your bill is optional.',
    ],
    start: [
      {
        title: 'Send your details',
        body: 'Name, address, and as much or as little about the bill as you want to share.',
      },
      {
        title: 'Talk through the setup',
        body: 'Panels, storage and backup, sized to the house you actually live in.',
      },
      {
        title: 'Decide on your time',
        body: 'Review the numbers and the terms. Nothing gets signed on this page.',
      },
    ],
    note: 'Solar inquiries continue to The Power Genie’s Sunrun referral page.',
    hero: {
      image: 'assets/stills/02-roof.webp',
      alt: 'Rows of solar-panel rooftops across a Texas neighborhood, seen from above.',
    },
  },
  'gas-genie': {
    name: 'Gas Genie',
    status: 'Coming soon',
    title: ['Gas Genie is', 'taking shape.'],
    sub: 'A pilot built around fuel credits and utility cashback. It is not open for enrollment yet.',
    heading: 'What exists today',
    copy: [
      'Gas Genie is the part of the family still in the workshop. The idea is simple: solar customers earn monthly fuel credits and utility cashback that land in a wallet they can draw on.',
      'The mechanics, the service area and the terms are still being worked out, so there is no enrollment to offer yet. What we will not do is take a sign-up for something that has not launched.',
    ],
    start: [],
    note: 'Solar inquiries go to The Power Genie’s Sunrun referral page. This is not Gas Genie enrollment.',
    hero: {
      image: 'assets/stills/05-community.webp',
      alt: 'A phone on a marble counter showing a Gas Genie rewards balance, with a lit home behind it.',
    },
  },
};

const GAS_GENIE_SPEC: [string, string][] = [
  ['Status', 'Pilot research'],
  ['Enrollment', 'Not open'],
  ['Program details', 'Not announced'],
  ['Solar through The Power Genie', 'Available now'],
];

export default function BrandPage({ id, onNavigate, getSalesforceUrl, onQuoteClick }: BrandPageProps) {
  if (id === 'brands') {
    return <FamilyIndex onNavigate={onNavigate} />;
  }

  return (
    <BrandWorld
      id={id}
      onNavigate={onNavigate}
      getSalesforceUrl={getSalesforceUrl}
      onQuoteClick={onQuoteClick}
    />
  );
}

function FamilyIndex({ onNavigate }: { onNavigate: (view: string) => void }) {
  return (
    <div className="pg-brand pg-family">
      <Masthead onNavigate={onNavigate} />

      <main>
        <section className="pg-hero" aria-labelledby="family-title">
          <img
            className="pg-hero__img"
            src="assets/stills/06-cta.webp"
            alt="A Texas home at dusk with solar on the roof, warm light in the windows, and the Dallas skyline behind it."
            decoding="async"
          />
          <div className="pg-hero__scrim" aria-hidden="true" />
          <div className="pg-hero__body">
            <h1 id="family-title" className="pg-display">
              Four doors into the same house.
            </h1>
            <p className="pg-hero__sub">
              Celebrity Solar, Hip-Hop Solar, Sport &amp; Solar and Gas Genie each reach Texas
              homeowners their own way. Whichever one brought you here, the next step is the same
              conversation about your roof.
            </p>
          </div>
        </section>

        <section className="pg-wrap pg-index" aria-label="The four Power Genie brands">
          <ul className="pg-index__list">
            <BrandRow
              href="/celebrity-solar"
              name="Celebrity Solar"
              line="Solar for the home that was always going to be looked at."
              accent="#edcd8b"
              wdth={118}
              wght={620}
              image="assets/stills/04-home.webp"
              lockup={LOCKUPS['celebrity-solar']}
              onOpen={() => onNavigate('celebrity-solar')}
            />
            <BrandRow
              href="/hip-hop-solar"
              name="Hip-Hop Solar"
              line="Solar for the block that sets its own pace."
              accent="#c0f477"
              wdth={80}
              wght={800}
              image="assets/stills/02-roof.webp"
              lockup={LOCKUPS['hip-hop-solar']}
              onOpen={() => onNavigate('hip-hop-solar')}
            />
            <BrandRow
              href="/sport-and-solar"
              name="Sport & Solar"
              line="Game day power for the house that hosts, with two game tickets on a Sunrun install."
              accent="#00e599"
              wdth={100}
              wght={700}
              image="assets/stills/01-sun.webp"
              lockup={LOCKUPS['sport-and-solar']}
            />
            <BrandRow
              href="/gas-genie"
              name="Gas Genie"
              line="A pilot in progress. Not open for enrollment yet."
              accent="#95dbe9"
              wdth={64}
              wght={580}
              image="assets/stills/05-community.webp"
              lockup={LOCKUPS['gas-genie']}
              onOpen={() => onNavigate('gas-genie')}
            />
          </ul>
        </section>

        <section className="pg-wrap pg-closer" aria-labelledby="family-next">
          <h2 id="family-next" className="pg-display">
            Not sure which door you came through?
          </h2>
          <div>
            <p>
              It does not change the next step. A free assessment covers your roof, your power use,
              and what solar with battery storage could do for the house. No obligation, and the
              electric bill is optional to book.
            </p>
            <div className="pg-actions">
              <button type="button" className="pg-btn" onClick={() => openAssistant('book')}>
                Book a free consultation
              </button>
              <button type="button" className="pg-link" onClick={() => onNavigate('journey')}>
                Start the solar journey
              </button>
            </div>
          </div>
        </section>
      </main>

      <BrandFooter onNavigate={onNavigate} />
    </div>
  );
}

/**
 * One row of the family index. Each brand sets its own width and weight on the
 * shared display face, so the family reads as one instrument played four ways.
 * Sport & Solar has no onOpen: it is its own static launch page.
 */
function BrandRow({
  href,
  name,
  line,
  accent,
  wdth,
  wght,
  image,
  lockup,
  onOpen,
}: {
  href: string;
  name: string;
  line: string;
  accent: string;
  wdth: number;
  wght: number;
  image: string;
  lockup: Lockup;
  onOpen?: () => void;
}) {
  return (
    <li>
      <a
        className="pg-row"
        href={href}
        aria-label={`Open ${name}`}
        onClick={(event) => {
          if (!onOpen) return;
          if (!shouldHandleClientNavigation(event)) return;
          event.preventDefault();
          onOpen();
        }}
        style={
          {
            '--brand-accent': accent,
            '--name-wdth': wdth,
            '--name-weight': wght,
            '--window-img': `url("${image}")`,
          } as React.CSSProperties
        }
      >
        <span className="pg-row__name pg-display">{name}</span>
        <span className="pg-row__line">{line}</span>
        <span className="pg-row__foot">
          <img
            className="pg-row__lockup"
            src={lockup.src}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />
          <span className="pg-row__go">Open</span>
        </span>
        <span className="pg-row__window" aria-hidden="true" />
      </a>
    </li>
  );
}

function BrandWorld({
  id,
  onNavigate,
  getSalesforceUrl,
  onQuoteClick,
}: {
  id: WorldId;
  onNavigate: (view: string) => void;
  getSalesforceUrl: (baseUrl: string) => string;
  onQuoteClick?: (msg?: string, sub?: string) => void;
}) {
  const world = WORLDS[id];
  const quoteHref = getSalesforceUrl(
    `https://sunrun.my.salesforce-sites.com/purl/?srep=/powergenie&utm_source=${id}`,
  );

  const primary =
    id === 'gas-genie' ? (
      <button type="button" className="pg-btn pg-btn--accent" onClick={() => onNavigate('brands')}>
        Explore The Power Genie family
      </button>
    ) : (
      <a
        className="pg-btn pg-btn--accent"
        href={quoteHref}
        onClick={() => onQuoteClick?.('Wonderful!', 'Taking you to our personalized inquiry form.')}
      >
        Explore my solar options
      </a>
    );

  const secondary =
    id === 'gas-genie' ? (
      <button type="button" className="pg-link" onClick={() => onNavigate('journey')}>
        Take the solar journey
      </button>
    ) : (
      <button type="button" className="pg-btn pg-btn--quiet" onClick={() => openAssistant('book')}>
        Book a free savings consult
      </button>
    );

  const actions = (
    <div className="pg-actions">
      {primary}
      {secondary}
    </div>
  );

  const title =
    id === 'hip-hop-solar' ? (
      <>
        <span>{world.title[0]}</span>
        <span>{world.title[1]}</span>
      </>
    ) : (
      <>
        {world.title[0]}
        <br />
        {world.title[1]}
      </>
    );

  return (
    <div className="pg-brand pg-world" data-brand={id}>
      <header className="pg-mast">
        <div className="pg-mast__brand">
          <img
            className="pg-mast__logo"
            src={LOCKUPS[id].src}
            alt={LOCKUPS[id].alt}
            width={LOCKUPS[id].width}
            height={LOCKUPS[id].height}
            decoding="async"
          />
        </div>
        <div className="pg-mast__nav">
          <a
            className="pg-link"
            href="/brands"
            onClick={(event) => {
              if (!shouldHandleClientNavigation(event)) return;
              event.preventDefault();
              onNavigate('brands');
            }}
          >
            Our brands
          </a>
          <button type="button" className="pg-btn pg-btn--quiet" onClick={() => openAssistant('book')}>
            Book a consult
          </button>
        </div>
      </header>

      <main>
        {id === 'gas-genie' ? (
          <section className="pg-hero pg-hero--type" aria-labelledby="world-title">
            <div className="pg-hero__body">
              <div className="pg-ruler" aria-hidden="true" />
              <h1 id="world-title" className="pg-display">
                {title}
              </h1>
              {world.status ? <p className="pg-status">{world.status}</p> : null}
              <p className="pg-hero__sub">{world.sub}</p>
              {actions}
            </div>
          </section>
        ) : id === 'hip-hop-solar' ? (
          <section className="pg-hero pg-hero--split" aria-labelledby="world-title">
            <div className="pg-hero__body">
              <h1 id="world-title" className="pg-display">
                {title}
              </h1>
              <p className="pg-hero__sub">{world.sub}</p>
              {actions}
            </div>
            <img
              className="pg-hero__img"
              src={world.hero.image}
              alt={world.hero.alt}
              decoding="async"
            />
          </section>
        ) : (
          <section className="pg-hero" aria-labelledby="world-title">
            <img
              className="pg-hero__img"
              src={world.hero.image}
              alt={world.hero.alt}
              decoding="async"
            />
            <div className="pg-hero__scrim" aria-hidden="true" />
            <div className="pg-hero__body">
              <h1 id="world-title" className="pg-display">
                {title}
              </h1>
              <p className="pg-hero__sub">{world.sub}</p>
              {actions}
            </div>
          </section>
        )}

        {id === 'gas-genie' ? (
          <section className="pg-wrap pg-body">
            <div className="pg-gasgenie__grid">
              <figure className="pg-gasgenie__figure">
                <img
                  className="pg-gasgenie__img"
                  src={world.hero.image}
                  alt={world.hero.alt}
                  loading="lazy"
                  decoding="async"
                />
                <figcaption>Concept work from the Gas Genie pilot: rewards landing in a customer wallet.</figcaption>
              </figure>
              <div>
                <h2 className="pg-display">{world.heading}</h2>
                {world.copy.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                <dl className="pg-spec">
                  {GAS_GENIE_SPEC.map(([key, value]) => (
                    <div className="pg-spec__row" key={key}>
                      <dt className="pg-spec__key">{key}</dt>
                      <dd className="pg-spec__val">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="pg-note">{world.note}</p>
              </div>
            </div>
          </section>
        ) : (
          <section className="pg-wrap pg-body">
            <div className="pg-lede">
              <h2 className="pg-display">{world.heading}</h2>
              <div className="pg-lede__copy">
                {world.copy.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>
            <ol className="pg-steps">
              {world.start.map((step) => (
                <li className="pg-step" key={step.title}>
                  <h3 className="pg-step__title">{step.title}</h3>
                  <p className="pg-step__body">{step.body}</p>
                </li>
              ))}
            </ol>
            <p className="pg-note">{world.note}</p>
          </section>
        )}
      </main>

      <BrandFooter onNavigate={onNavigate} />
    </div>
  );
}

function Masthead({ onNavigate }: { onNavigate: (view: string) => void }) {
  return (
    <header className="pg-mast">
      <div className="pg-mast__brand">
        <img
          className="pg-mast__logo"
          src={LOCKUPS['power-genie'].src}
          alt={LOCKUPS['power-genie'].alt}
          width={LOCKUPS['power-genie'].width}
          height={LOCKUPS['power-genie'].height}
          decoding="async"
        />
      </div>
      <div className="pg-mast__nav">
        <button type="button" className="pg-link" onClick={() => onNavigate('journey')}>
          The solar journey
        </button>
        <button type="button" className="pg-btn pg-btn--quiet" onClick={() => openAssistant('book')}>
          Book a consult
        </button>
      </div>
    </header>
  );
}

function BrandFooter({ onNavigate }: { onNavigate: (view: string) => void }) {
  return (
    <footer className="pg-foot">
      <div className="pg-wrap pg-foot__inner">
        <button type="button" className="pg-link" onClick={() => onNavigate('journey')}>
          The Power Genie
        </button>
        <button type="button" className="pg-link" onClick={() => onNavigate('brands')}>
          All four brands
        </button>
      </div>
    </footer>
  );
}
