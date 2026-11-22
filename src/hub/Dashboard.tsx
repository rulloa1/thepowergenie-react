import React, { lazy, Suspense, useEffect, useState } from 'react';
import './dashboard.css';
import GuestAlerts from './GuestAlerts';
import type { Session } from '@supabase/supabase-js';
import { CalendarDays, CalendarPlus, FolderOpen, Inbox, LogOut, MessageCircle, Video } from 'lucide-react';
import { useLeadFeed } from './useLeadFeed';
import { hubNavFor } from './hubNav';
import { hubTabFromLocation, type HubTab } from '../lib/siteRoutes';
import { arrivalAuthType, supabase } from '../lib/supabase';
import { powerGenieEmail } from '../../shared/hub-access';
import { dashboardLoginEmail } from '../../shared/hub-login';
import { BrandMark, Button, Notice, NotConfigured, Spinner, cn } from './ui';

const ChatTab = lazy(() => import('./ChatTab'));
const ConferenceDesk = lazy(() => import('./ConferenceDesk'));
const FilesTab = lazy(() => import('./FilesTab'));
const LeadsTab = lazy(() => import('./LeadsTab'));
const ScheduleTab = lazy(() => import('./ScheduleTab'));

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: 'owner' | 'admin';
}

const DEMO_PROFILE: Profile = {
  id: 'demo-horace-7721',
  email: 'horace.lawrence@sunrun.com',
  full_name: 'Horace Lawrence',
  role: 'owner',
};

type Tab = HubTab;
const TAB_ICONS = {
  leads: Inbox,
  chat: MessageCircle,
  schedule: CalendarDays,
  files: FolderOpen,
  conference: Video,
} as const;

function roleLabel(role: Profile['role']): string {
  return role === 'owner' ? 'Sunrun rep' : 'Referral marketer';
}

function initialTab(): Tab {
  if (typeof window === 'undefined') return 'leads';
  return hubTabFromLocation(window.location.pathname, window.location.search);
}

function setDemoQuery(on: boolean) {
  const url = new URL(window.location.href);
  if (on) url.searchParams.set('demo', 'true');
  else url.searchParams.delete('demo');
  window.history.replaceState({}, '', url);
}

export default function Dashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [needsPassword, setNeedsPassword] = useState(arrivalAuthType === 'invite' || arrivalAuthType === 'recovery');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(() => {
    return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === 'true';
  });

  useEffect(() => {
    document.title = 'Dashboard — The Power Genie';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      setSession(error ? null : data.session);
      setSessionError(error ? "Couldn't check your sign-in. Refresh and try again." : null);
      setReady(true);
    }).catch(() => {
      if (!alive) return;
      setSession(null);
      setSessionError("Couldn't check your sign-in. Refresh and try again.");
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setSessionError(null);
      setReady(true);
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setProfile(undefined);
      setProfileError(null);
      return;
    }
    let alive = true;
    void (async () => {
      if (powerGenieEmail(session.user.email || '')) {
        const access = await fetch('/api/assistant?route=hub-access', {
          method: 'POST', headers: { authorization: `Bearer ${session.access_token}` },
        });
        if (!access.ok) throw new Error('Could not activate dashboard access.');
      }
      return await Promise.resolve(
      supabase
        .from('hub_profiles')
        .select('id, email, full_name, role')
        .eq('id', session.user.id)
        .maybeSingle(),
      );
    })().then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          setProfile(null);
          setProfileError("Couldn't load your access. Refresh and try again.");
          return;
        }
        setProfileError(null);
        setProfile((data as Profile) ?? null);
      })
      .catch(() => {
        if (!alive) return;
        setProfile(null);
        setProfileError("Couldn't load your access. Refresh and try again.");
      });
    return () => {
      alive = false;
    };
  }, [session]);

  const openSample = () => {
    setDemoQuery(true);
    setIsDemo(true);
  };
  const closeSample = () => {
    setDemoQuery(false);
    setIsDemo(false);
  };

  useEffect(() => {
    if (session && isDemo) {
      setDemoQuery(false);
      setIsDemo(false);
    }
  }, [session, isDemo]);

  if (supabase && !ready) return <FullPageSpinner />;
  if (isDemo && !session) {
    return <HubApp profile={DEMO_PROFILE} isDemo onExitDemo={closeSample} />;
  }
  if (!supabase) return <NotConfigured what="The Dashboard" onExploreDemo={openSample} />;
  if (!ready) return <FullPageSpinner />;
  if (sessionError) return <AuthProblem title="Couldn't open the hub" message={sessionError} />;
  if (!session) return <SignIn onExploreDemo={openSample} />;
  if (needsPassword) return <SetPassword onDone={() => setNeedsPassword(false)} />;
  if (profileError) {
    return (
      <AuthProblem
        title="Couldn't check access"
        message={profileError}
        onSignOut={() => { void supabase?.auth.signOut(); }}
      />
    );
  }
  if (profile === undefined) return <FullPageSpinner />;
  if (profile === null) return <NotInvited email={session.user.email ?? ''} />;
  return <HubApp profile={profile} />;
}

function FullPageSpinner() {
  return (
    <div className="hub-canvas flex min-h-screen items-center justify-center text-hub-soft">
      <Spinner />
    </div>
  );
}

function AuthProblem({ title, message, onSignOut }: { title: string; message: string; onSignOut?: () => void }) {
  return (
    <AuthCard title={title}>
      <Notice tone="error">{message}</Notice>
      {onSignOut ? (
        <Button type="button" variant="ghost" className="mt-6 w-full rounded-full" onClick={onSignOut}>Sign out</Button>
      ) : (
        <Button type="button" className="mt-6 w-full rounded-full" onClick={() => window.location.reload()}>Try again</Button>
      )}
    </AuthCard>
  );
}

/* Sign-in chrome uses the public site's palette: navy #0B2233, orange #FF6B00,
   ink #1A1A2E on a light field. The form side sits in the .book-page light scope
   so the shared Notice/Button tokens stay readable on white. */
const authInputClass =
  'w-full rounded-xl border border-[#1A1A2E]/15 bg-white px-3.5 py-3 text-base text-[#1A1A2E] outline-none transition placeholder:text-[#64748b] hover:border-[#1A1A2E]/35 focus:border-[#FF6B00] focus:ring-4 focus:ring-[#FF6B00]/20';
const authLabelClass = 'mb-1.5 block text-[0.84rem] font-semibold text-[#1A1A2E]';
const authFocus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9A3412] focus-visible:ring-offset-2';

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#F4F6FA] font-[family:var(--sw-font-body)] lg:flex-row">
      {/* Brand side — same navy, still and orange rule as the public site */}
      <aside className="relative isolate flex shrink-0 flex-col overflow-hidden bg-[#0B2233] px-6 py-5 text-white shadow-[inset_0_-3px_0_#FF6B00] sm:px-10 lg:w-[46%] lg:px-14 lg:py-12 lg:shadow-[inset_-3px_0_0_#FF6B00]">
        <img
          src="/assets/stills/06-cta.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-10 hidden h-full w-full object-cover opacity-40 lg:block"
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10 hidden bg-gradient-to-t from-[#0B2233] via-[#0B2233]/80 to-[#0B2233]/55 lg:block" />

        <a href="/" className={cn('flex items-center gap-3 rounded-xl text-white no-underline', authFocus)} title="The Power Genie home">
          <img src="/assets/brand/power-genie-icon.png" alt="" className="h-10 w-10 rounded-xl bg-white/10 object-cover lg:h-12 lg:w-12" />
          <span className="leading-tight">
            <span className="block text-base font-bold lg:text-lg">The Power Genie</span>
            <span className="block text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[#FF8A2B]">Dashboard</span>
          </span>
        </a>

        <div className="mt-5 max-w-md lg:mt-auto lg:max-w-lg lg:pt-16">
          <h2 className="m-0 hidden text-[clamp(2.25rem,3.6vw,3.4rem)] font-bold leading-[1.05] tracking-tight text-balance lg:block">
            The bill, the savings, and the roof. <span className="text-[#FF8A2B]">One desk.</span>
          </h2>
          <p className="m-0 max-w-md text-[0.98rem] leading-relaxed text-[#D9E6F2] lg:mt-5 lg:text-[1.02rem]">
            Rory logs the light bill. Horace runs the numbers and the panel layout. Both see the same customer, the same files, and the same chat.
          </p>
        </div>

        <p className="mt-auto hidden pt-12 text-[0.8rem] text-[#8EAEC7] lg:block">The Power Genie by Sunrun · Houston</p>
      </aside>

      {/* Form side */}
      <main className="book-page flex flex-1 items-start justify-center px-5 py-10 sm:items-center sm:px-8 lg:py-12">
        <div className="w-full max-w-[400px]">
          <img
            src="/assets/brand/power-genie-lockup.webp"
            alt="The Power Genie Dashboard"
            className="mb-8 hidden h-auto w-60 rounded-2xl bg-[#0B2233] px-5 py-3 shadow-[inset_0_-3px_0_#FF6B00,0_10px_30px_rgba(11,34,51,0.18)] lg:block"
          />
          <h1 className="m-0 text-[2rem] font-bold leading-tight tracking-tight text-[#1A1A2E]">{title}</h1>
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}

function SignIn({ onExploreDemo }: { onExploreDemo?: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  const email = dashboardLoginEmail(identifier);

  const emailLink = async () => {
    if (!email) return setError('Enter your username or email first, then tap “Email me a sign-in link”.');
    setError(null);
    setResetSent(false);
    setBusy(true);
    if (powerGenieEmail(email)) {
      try {
        const prepared = await fetch('/api/assistant?route=hub-access', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email.trim() }),
        });
        if (!prepared.ok) throw new Error();
      } catch {
        setBusy(false);
        setError('Could not prepare your sign-in. Please try again.');
        return;
      }
    }
    const { error } = await supabase!.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setBusy(false);
    // Same message either way, so the form never reveals who has access.
    if (error && (powerGenieEmail(email) || !/not allowed|signups not allowed|user not found/i.test(error.message))) return setError(error.message);
    setLinkSent(true);
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message === 'Invalid login credentials' ? 'Check your username or email and password.' : error.message);
  };

  const reset = async () => {
    if (!email) return setError('Enter your username or email first, then tap “Forgot password”.');
    setError(null);
    setLinkSent(false);
    setBusy(true);
    const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/dashboard` });
    setBusy(false);
    if (error) return setError(error.message);
    setResetSent(true);
  };

  return (
    <AuthCard title="Sign in">
      <form onSubmit={signIn} className="grid gap-4">
        <div>
          <label htmlFor="s-email" className={authLabelClass}>Username or email</label>
          <input id="s-email" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={authInputClass} />
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label htmlFor="s-pass" className={cn(authLabelClass, 'mb-0')}>Password</label>
            <button type="button" onClick={reset} className={cn('rounded-sm text-[0.82rem] font-semibold text-[#0066CC] hover:underline', authFocus)}>
              Forgot password?
            </button>
          </div>
          <input id="s-pass" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={authInputClass} />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {resetSent && <Notice tone="success">If that email has access, a reset link is on its way.</Notice>}
        {linkSent && <Notice tone="success">If that email has access, a sign-in link is on its way.</Notice>}
        <Button type="submit" disabled={busy} className="mt-1 min-h-[52px] w-full rounded-full text-base">
          {busy ? <Spinner className="h-4 w-4" /> : 'Sign in'}
        </Button>

        <div className="flex items-center gap-3 text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-[#64748b]" aria-hidden="true">
          <span className="h-px flex-1 bg-[#1A1A2E]/10" />
          or
          <span className="h-px flex-1 bg-[#1A1A2E]/10" />
        </div>
        <button
          type="button"
          onClick={emailLink}
          disabled={busy}
          className={cn('inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center rounded-full border border-[#1A1A2E]/15 bg-white px-5 text-[0.95rem] font-semibold text-[#1A1A2E] transition hover:border-[#1A1A2E]/35 disabled:opacity-60', authFocus)}
        >
          Email me a sign-in link
        </button>

        <p className="m-0 mt-2 text-center text-[0.8rem] text-[#4A5568]">
          Access is by invitation. Need in? Ask Horace or Rory.
        </p>
        {onExploreDemo && (
          <button
            type="button"
            onClick={onExploreDemo}
            className={cn('justify-self-center text-[0.84rem] font-semibold text-[#0066CC] hover:underline', authFocus)}
          >
            Preview a sample desk
          </button>
        )}
      </form>
    </AuthCard>
  );
}

function SetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('The two passwords don’t match.');
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    window.history.replaceState({}, '', '/dashboard');
    onDone();
  };

  return (
    <AuthCard title="Set your password">
      <form onSubmit={save} className="grid gap-4">
        <p className="m-0 text-[0.95rem] leading-relaxed text-[#4A5568]">
          Choose a password for this invite. You will use it the next time you open the Dashboard.
        </p>
        <div>
          <label htmlFor="p1" className={authLabelClass}>New password</label>
          <input id="p1" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={authInputClass} />
        </div>
        <div>
          <label htmlFor="p2" className={authLabelClass}>Confirm password</label>
          <input id="p2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={authInputClass} />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={busy} className="min-h-[52px] w-full rounded-full text-base">
          {busy ? <Spinner className="h-4 w-4" /> : 'Save and continue'}
        </Button>
      </form>
    </AuthCard>
  );
}

function NotInvited({ email }: { email: string }) {
  return (
    <AuthCard title="No access yet">
      <p className="m-0 text-[#4A5568]">
        <span className="font-semibold text-[#1A1A2E]">{email}</span> isn't on the Dashboard. Ask Horace or Rory for an invite.
      </p>
      <Button variant="ghost" className="mt-6 w-full rounded-full" onClick={() => supabase!.auth.signOut()}>
        Sign out
      </Button>
    </AuthCard>
  );
}

function HubApp({
  profile,
  isDemo = false,
  onExitDemo,
}: {
  profile: Profile;
  isDemo?: boolean;
  onExitDemo?: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [addingAppointment, setAddingAppointment] = useState(false);
  const leads = useLeadFeed(profile.id);
  const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E8F4FD]';
  const tabs = hubNavFor(profile.role).map((item) => ({ ...item, icon: TAB_ICONS[item.id] }));

  useEffect(() => {
    const sync = () => {
      setAddingAppointment(false);
      setTab(initialTab());
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const go = (t: Tab) => {
    if (t !== 'schedule') setAddingAppointment(false);
    setTab(t);
    const url = new URL(window.location.href);
    url.pathname = '/dashboard';
    url.searchParams.set('tab', t);
    if (t !== 'leads') url.searchParams.delete('id');
    if (`${url.pathname}${url.search}` !== `${window.location.pathname}${window.location.search}`) {
      window.history.pushState({}, '', url);
    }
  };

  return (
    <div className="hub-desk hub-dashboard flex min-h-[100dvh] flex-col font-[family:var(--sw-font-body)]">
      {isDemo && (
        <div className="border-b border-[#E8C56B] bg-[#FFF8E8] px-4 py-2 text-center text-sm text-[#5C4308]">
          <p className="m-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <span>Sample desk. Nothing here is saved. Sign in to work the real customers.</span>
            <button type="button" onClick={onExitDemo} className={cn('min-h-11 cursor-pointer rounded-lg px-2 font-bold underline underline-offset-2', focus)}>
              Back to sign in
            </button>
          </p>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-[color-mix(in_srgb,var(--sw-ink)_8%,transparent)] bg-[color-mix(in_srgb,var(--sw-bg)_82%,transparent)] shadow-[inset_0_-3px_0_var(--pg-orange)] backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/" className={cn('rounded-xl', focus)} title="The Power Genie home">
              <BrandMark className="h-9 shadow-[0_4px_12px_rgba(7,27,39,0.18)]" />
            </a>
            <span className="hidden text-base font-bold text-[var(--sw-ink)] sm:inline">Dashboard</span>
          </div>
          <div className="flex items-center gap-2.5">
            {!isDemo && (
              <Button type="button" onClick={() => {
                go('schedule');
                setAddingAppointment(true);
                document.getElementById('a-date')?.focus();
              }}>
                <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Add appointment
              </Button>
            )}
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0B2233] text-[0.78rem] font-bold text-white" aria-hidden="true">
                {(profile.full_name || profile.email).slice(0, 2).toUpperCase()}
              </div>
              <span className="hidden text-left text-[0.82rem] leading-tight sm:block">
                <span className="block font-bold text-[var(--sw-ink)]">{profile.full_name || profile.email}</span>
                <span className="text-[0.72rem] font-semibold text-[var(--sw-ink-soft)]">{roleLabel(profile.role)}</span>
              </span>
            </div>
            {isDemo ? (
              <button
                type="button"
                onClick={onExitDemo}
                className={cn('min-h-11 cursor-pointer rounded-full border border-[color-mix(in_srgb,var(--sw-ink)_15%,transparent)] bg-white px-3 text-[0.78rem] font-bold text-[var(--sw-ink)] hover:border-[var(--sw-ink)]', focus)}
              >
                Exit sample
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { void supabase!.auth.signOut(); }}
                className={cn('flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--sw-ink)_15%,transparent)] bg-white text-[var(--sw-ink-soft)] hover:border-[var(--sw-ink)] hover:text-[var(--sw-ink)]', focus)}
                aria-label="Sign out"
                title="Sign out of Dashboard"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl flex-wrap gap-1 px-2 py-2 sm:gap-2 sm:px-5" aria-label="Dashboard sections">
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-base font-bold transition sm:px-4',
                  focus,
                  active
                    ? 'bg-[var(--sw-ink)] text-white'
                    : 'text-[var(--sw-ink-soft)] hover:bg-white/80 hover:text-[var(--sw-ink)]',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
                {id === 'leads' && leads.unseen > 0 && (
                  <span className={cn(
                    'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[0.68rem] font-black',
                    active ? 'bg-white text-[var(--sw-ink)]' : 'bg-[var(--pg-orange)] text-white',
                  )}>
                    {leads.unseen > 99 ? '99+' : leads.unseen}
                    <span className="sr-only"> new leads</span>
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        {!isDemo && <GuestAlerts />}
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-5 sm:px-6">
        <Suspense fallback={<div className="py-10 text-center"><Spinner /></div>}>
          {tab === 'leads' && <LeadsTab feed={leads} profile={profile} />}
          {tab === 'chat' && <ChatTab profile={profile} />}
          {tab === 'files' && <FilesTab sample={isDemo} />}
          {tab === 'schedule' && <ScheduleTab profile={profile} adding={addingAppointment} setAdding={setAddingAppointment} />}
          {tab === 'conference' && <ConferenceDesk leads={leads.leads} sample={isDemo} />}
        </Suspense>
      </main>
    </div>
  );
}
