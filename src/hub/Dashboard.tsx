import React, { lazy, Suspense, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CalendarDays, FolderOpen, Inbox, LogOut, MessageCircle } from 'lucide-react';
import { useLeadFeed } from './useLeadFeed';
import { arrivalAuthType, supabase } from '../lib/supabase';
import { BrandMark, Button, Notice, NotConfigured, Spinner, cn, inputClass, labelClass } from './ui';

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

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="hub-canvas flex min-h-screen items-start justify-center px-4 py-16 sm:items-center">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0C1E32]/95 p-7 shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
        <BrandMark className="mb-6 shadow-md" />
        <p className="m-0 text-[0.74rem] font-semibold uppercase tracking-[0.14em] text-[#FF8A2B]">Referral Hub</p>
        <h1 className="m-0 mt-1 text-2xl font-bold tracking-tight text-white">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function SignIn({ onExploreDemo }: { onExploreDemo?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

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
    await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/dashboard` });
    setResetSent(true);
  };

  return (
    <AuthCard title="Sign in">
      <form onSubmit={signIn} className="grid gap-4">
        <div>
          <label htmlFor="s-email" className={labelClass}>Email</label>
          <input id="s-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="s-pass" className={labelClass}>Password</label>
          <input id="s-pass" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {resetSent && <Notice tone="success">If that email has access, a reset link is on its way.</Notice>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? <Spinner className="h-4 w-4" /> : 'Sign in'}
        </Button>
        <Button type="button" variant="quiet" onClick={reset} className="justify-self-center">
          Forgot password?
        </Button>
        <div className="pt-2 border-t border-hub-line flex flex-col items-center gap-2">
          {onExploreDemo && (
            <Button
              type="button"
              variant="ghost"
              onClick={onExploreDemo}
              className="w-full text-xs font-bold text-[#FF8A2B] border border-[#FF6B00]/40 bg-[#FF6B00]/15 hover:bg-[#FF6B00]/25 transition"
            >
              ✨ Explore Demo Dashboard
            </Button>
          )}
          <p className="m-0 text-center text-[0.78rem] text-hub-soft">
            Production access is by invitation only.
          </p>
        </div>
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
          <label htmlFor="p1" className={labelClass}>New password</label>
          <input id="p1" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="p2" className={labelClass}>Confirm password</label>
          <input id="p2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? <Spinner className="h-4 w-4" /> : 'Save and continue'}
        </Button>
      </form>
    </AuthCard>
  );
}

function NotInvited({ email }: { email: string }) {
  return (
    <AuthCard title="No access yet">
      <p className="m-0 text-hub-soft">
        <span className="font-semibold text-hub-ink">{email}</span> isn't on the Referral Hub. Ask Horace or Rory for an invite.
      </p>
      <Button variant="ghost" className="mt-6 w-full" onClick={() => supabase!.auth.signOut()}>
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
            <a
              href="/homeowner"
              className="hidden sm:inline-flex items-center gap-1 text-[0.78rem] font-bold text-[#FF8A2B] hover:text-[#FF8A2B]/80 transition-colors px-2.5 py-1 rounded-lg border border-[#FF6B00]/40 bg-[#FF6B00]/15 no-underline"
            >
              🔋 Homeowner Portal
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
