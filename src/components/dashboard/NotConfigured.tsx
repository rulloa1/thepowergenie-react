import React from 'react';
import { SiteShell, TopBar, primaryButtonClass, useNoIndex, usePageTitle } from './ui';

export default function NotConfigured({
  eyebrow,
  title,
  body,
  noIndex = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  noIndex?: boolean;
}) {
  usePageTitle(`${title} — The Power Genie`);
  useNoIndex(noIndex);
  return (
    <SiteShell>
      <TopBar />
      <main className="mx-auto max-w-xl px-4 py-16">
        <p className="m-0 text-xs font-bold uppercase tracking-[0.14em] text-[#FF6B00]">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-[#4A5568]">{body}</p>
        <a className={`${primaryButtonClass} mt-8`} href="/">Back to the site</a>
      </main>
    </SiteShell>
  );
}

export class FriendlyBoundary extends React.Component<
  { children: React.ReactNode; title: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <NotConfigured
          eyebrow="Something went wrong"
          title={this.props.title}
          body="This page hit a problem and stopped. Refresh and try again. If this has not been set up yet, follow the steps in SETUP.md."
        />
      );
    }
    return this.props.children;
  }
}
