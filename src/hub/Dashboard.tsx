import React, { lazy, Suspense, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CalendarDays, FolderOpen, Inbox, LogOut, MessageCircle } from 'lucide-react';
import { useLeadFeed } from './useLeadFeed';
import { arrivalAuthType, supabase } from '../lib/supabase';
import { BrandMark, Button, Notice, NotConfigured, Spinner, cn } from './ui';

const ChatTab = lazy(() => import('./ChatTab'));
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

type Tab = 'chat' | 'files' | 'schedule' | 'leads';
const TABS: { id: Tab; label: string; icon: typeof MessageCircle }[] = [
  { id: 'leads', label: 'Leads', icon: Inbox },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
];

function initialTab(): Tab {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/pipeline')) {
    return 'leads';
  }
  const t = new URLSearchParams(window.location.search).get('tab');
  return t === 'files' || t === 'schedule' || t === 'leads' ? t : 'leads';
}

export default function Dashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [needsPassword, setNeedsPassword] = useState(arrivalAuthType === 'invite' || arrivalAuthType === 'recovery');
  const [isDemo, setIsDemo] = useState(() => {
    return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === 'true';
  });

  useEffect(() => {
    document.title = 'Referral Hub — The Power Genie';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setReady(true);
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setProfile(undefined);
      return;
    }
    supabase
      .from('hub_profiles')
      .select('id, email, full_name, role')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setProfile((data as Profile) ?? null));
  }, [session]);

  if (isDemo) {
    return <HubApp profile={DEMO_PROFILE} isDemo onExitDemo={() => setIsDemo(false)} />;
  }
  if (!supabase) return <NotConfigured what="The Referral Hub" />;
  if (!ready) return <FullPageSpinner />;
  if (!session) return <SignIn onExploreDemo={() => setIsDemo(true)} />;
  if (needsPassword) return <SetPassword onDone={() => setNeedsPassword(false)} />;
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

/* Sign-in chrome uses the public site's palette: navy #0B2233, orange #FF6B00,
   ink #1A1A2E on a light field. The form side sits in the .book-page light scope
   so the shared Notice/Button tokens stay readable on white. */
const authInputClass =
  'w-full rounded-xl border border-[#1A1A2E]/15 bg-white px-3.5 py-3 text-base text-[#1A1A2E] outline-none transition placeholder:text-[#64748b] hover:border-[#1A1A2E]/35 focus:border-[#FF6B00] focus:ring-4 focus:ring-[#FF6B00]/20';
const authLabelClass = 'mb-1.5 block text-[0.84rem] font-semibold text-[#1A1A2E]';
const authPrimaryClass =
  'w-full rounded-full border-0 bg-[#FF6B00] text-white shadow-[0_10px_24px_rgba(255,107,0,0.35)] hover:bg-[#F25F00] hover:shadow-[0_12px_28px_rgba(255,107,0,0.42)] focus-visible:ring-[#FF6B00] focus-visible:ring-offset-white disabled:bg-[#FF6B00]/60 disabled:text-white';

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

        <a href="/" className="flex items-center gap-3 text-white no-underline" title="The Power Genie home">
          <img src="/assets/brand/power-genie-icon.png" alt="" className="h-10 w-10 rounded-xl bg-white/10 object-cover lg:h-12 lg:w-12" />
          <span className="leading-tight">
            <span className="block text-base font-bold lg:text-lg">The Power Genie</span>
            <span className="block text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[#FF8A2B]">Referral Hub</span>
          </span>
        </a>

        <div className="mt-auto hidden max-w-lg pt-16 lg:block">
          <h2 className="m-0 text-[clamp(2.25rem,3.6vw,3.4rem)] font-bold leading-[1.05] tracking-tight text-balance">
            The bill, the savings, and the roof. <span className="text-[#FF8A2B]">One desk.</span>
          </h2>
          <p className="mt-5 max-w-md text-[1.02rem] leading-relaxed text-[#D9E6F2]">
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
            alt="The Power Genie Referral Hub"
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  const emailLink = async () => {
    if (!email.trim()) return setError('Enter your email first, then tap “Email me a sign-in link”.');
    setError(null);
    setResetSent(false);
    setBusy(true);
    const { error } = await supabase!.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setBusy(false);
    // Same message either way, so the form never reveals who has access.
    if (error && !/not allowed|signups not allowed|user not found/i.test(error.message)) return setError(error.message);
    setLinkSent(true);
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === 'Invalid login credentials' ? 'That email and password don’t match.' : error.message);
  };

  const reset = async () => {
    if (!email.trim()) return setError('Enter your email first, then tap “Forgot password”.');
    setError(null);
    setLinkSent(false);
    await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/dashboard` });
    setResetSent(true);
  };

  return (
    <AuthCard title="Sign in">
      <form onSubmit={signIn} className="grid gap-4">
        <div>
          <label htmlFor="s-email" className={authLabelClass}>Email</label>
          <input id="s-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={authInputClass} />
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label htmlFor="s-pass" className={cn(authLabelClass, 'mb-0')}>Password</label>
            <button type="button" onClick={reset} className="text-[0.82rem] font-semibold text-[#0066CC] hover:underline">
              Forgot password?
            </button>
          </div>
          <input id="s-pass" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={authInputClass} />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {resetSent && <Notice tone="success">If that email has access, a reset link is on its way.</Notice>}
        {linkSent && <Notice tone="success">If that email has access, a sign-in link is on its way.</Notice>}
        <Button type="submit" disabled={busy} className={cn(authPrimaryClass, 'mt-1 min-h-[52px] text-base')}>
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
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-[#1A1A2E]/15 bg-white px-5 text-[0.95rem] font-semibold text-[#1A1A2E] transition hover:border-[#1A1A2E]/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2 disabled:opacity-60"
        >
          Email me a sign-in link
        </button>

        <p className="m-0 mt-2 text-center text-[0.8rem] text-[#4A5568]">
          Access is by invitation. Need in? Ask Horace or Rory.
        </p>
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
        <div>
          <label htmlFor="p1" className={authLabelClass}>New password</label>
          <input id="p1" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={authInputClass} />
        </div>
        <div>
          <label htmlFor="p2" className={authLabelClass}>Confirm password</label>
          <input id="p2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={authInputClass} />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={busy} className={cn(authPrimaryClass, 'min-h-[52px] text-base')}>
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
        <span className="font-semibold text-[#1A1A2E]">{email}</span> isn't on the Referral Hub. Ask Horace or Rory for an invite.
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
  const leads = useLeadFeed(profile.id);

  const go = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', t);
    if (t !== 'leads') url.searchParams.delete('id');
    window.history.replaceState({}, '', url);
  };

  return (
    <div className="hub-canvas flex min-h-[100dvh] flex-col">
      {isDemo && (
        <div className="sticky top-0 z-40 bg-gradient-to-r from-[#FF6B00]/25 via-[#FF8A2B]/20 to-[#FF6B00]/25 border-b border-[#FF6B00]/40 px-4 py-2 text-center text-xs sm:text-sm text-white backdrop-blur-xl flex flex-wrap items-center justify-center gap-2 shadow-lg shadow-black/40">
          <span className="inline-flex items-center gap-1.5 font-bold text-[#FF8A2B]">
            <span className="h-2 w-2 rounded-full bg-[#FF6B00] animate-pulse" />
            ✨ Demo Mode:
          </span>
          <span className="text-[#E0ECF6]">Viewing live preview of Horace Lawrence's Sunrun Partner Workspace. Interactive leads, AI advisor, files, and scheduling tools.</span>
          <button onClick={onExitDemo} className="ml-2 rounded-lg bg-[#FF6B00]/20 border border-[#FF6B00]/40 px-2.5 py-0.5 text-xs font-bold text-[#FF8A2B] hover:bg-[#FF6B00]/30 hover:text-white transition cursor-pointer">
            Exit to Sign In
          </button>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-[#1E2E42] bg-[#0A1828]/95 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/" className="transition-opacity hover:opacity-80" title="Return to The Power Genie Home">
              <BrandMark className="h-9 shadow-sm" />
            </a>
            <div className="flex items-center gap-2">
              <span className="hidden text-[0.8rem] font-bold uppercase tracking-[0.14em] text-[#FF8A2B] sm:inline">Referral Hub</span>
              <span className="hidden items-center gap-1.5 rounded-full border border-[#4ADE80]/30 bg-[#4ADE80]/15 px-2.5 py-0.5 text-[0.7rem] font-bold text-[#4ADE80] md:inline-flex">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4ADE80]" />
                Live Advisor
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <a
              href="/"
              className="hidden lg:inline-flex items-center gap-1 text-[0.78rem] font-semibold text-[#8EAEC7] hover:text-white transition-colors px-2.5 py-1 rounded-lg border border-[#28496B] bg-[#0C1E32] no-underline"
            >
              ← Public Site
            </a>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#FF6B00] to-[#E65100] text-[0.78rem] font-bold text-white shadow-sm">
                {(profile.full_name || profile.email).slice(0, 2).toUpperCase()}
              </div>
              <span className="hidden text-left text-[0.82rem] leading-tight sm:block">
                <span className="block font-bold text-white">{profile.full_name || profile.email}</span>
                <span className="text-[0.72rem] font-semibold text-[#8EAEC7]">{profile.role === 'owner' ? 'Sunrun Partner' : 'Admin'}</span>
              </span>
            </div>
            {isDemo ? (
              <button
                onClick={onExitDemo}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#FF6B00]/40 bg-[#FF6B00]/20 text-[0.78rem] font-bold text-[#FF8A2B] transition-all hover:bg-[#FF6B00]/30 hover:text-white cursor-pointer"
                title="Exit Demo Mode"
              >
                Exit Demo
              </button>
            ) : (
              <button
                onClick={() => supabase!.auth.signOut()}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#28496B] bg-[#0C1E32] text-[#8EAEC7] transition-all hover:border-white/20 hover:bg-[#132B45] hover:text-white cursor-pointer"
                aria-label="Sign out"
                title="Sign out of Referral Hub"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-2 px-3 py-2 sm:px-5 overflow-x-auto scrollbar-none" aria-label="Dashboard sections">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => go(id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer',
                  active
                    ? 'bg-gradient-to-r from-[#FF6B00] to-[#E65100] text-white shadow-md shadow-[#FF6B00]/25'
                    : 'border border-transparent text-[#8EAEC7] hover:border-white/10 hover:bg-white/5 hover:text-white',
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0 transition-transform', active && 'scale-110 text-white')} />
                <span>{label}</span>
                {id === 'leads' && leads.unseen > 0 && (
                  <span className={cn(
                    "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[0.68rem] font-black shadow-sm",
                    active ? "bg-white text-[#FF6B00]" : "bg-[#FF6B00] text-white"
                  )}>
                    {leads.unseen > 99 ? '99+' : leads.unseen}
                    <span className="sr-only"> new leads</span>
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-5 sm:px-6">
        <Suspense fallback={<div className="py-10 text-center"><Spinner /></div>}>
          {tab === 'leads' && <LeadsTab feed={leads} profile={profile} />}
          {tab === 'chat' && <ChatTab profile={profile} />}
          {tab === 'files' && <FilesTab />}
          {tab === 'schedule' && <ScheduleTab profile={profile} />}
        </Suspense>
      </main>
    </div>
  );
}
