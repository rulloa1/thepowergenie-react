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

type Tab = 'chat' | 'files' | 'schedule' | 'leads';
const TABS: { id: Tab; label: string; icon: typeof MessageCircle }[] = [
  { id: 'leads', label: 'Leads', icon: Inbox },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
];

function initialTab(): Tab {
  const t = new URLSearchParams(window.location.search).get('tab');
  return t === 'files' || t === 'schedule' || t === 'leads' ? t : 'chat';
}

export default function Dashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [needsPassword, setNeedsPassword] = useState(arrivalAuthType === 'invite' || arrivalAuthType === 'recovery');

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

  if (!supabase) return <NotConfigured what="The Referral Hub" />;
  if (!ready) return <FullPageSpinner />;
  if (!session) return <SignIn />;
  if (needsPassword) return <SetPassword onDone={() => setNeedsPassword(false)} />;
  if (profile === undefined) return <FullPageSpinner />;
  if (profile === null) return <NotInvited email={session.user.email ?? ''} />;
  return <HubApp profile={profile} />;
}

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F7FB] text-[#4A5568]">
      <Spinner />
    </div>
  );
}

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-[#F6F7FB] px-4 py-16 sm:items-center">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-[0_10px_30px_rgba(10,20,40,0.08)]">
        <BrandMark className="mb-6" />
        <p className="m-0 text-[0.74rem] font-semibold uppercase tracking-[0.14em] text-[#FF6B00]">Referral Hub</p>
        <h1 className="m-0 mt-1 text-2xl font-bold tracking-tight text-[#1A1A2E]">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function SignIn() {
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
        <p className="m-0 text-center text-[0.8rem] text-[#6B7280]">Access is by invitation only.</p>
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
      <p className="m-0 text-[#4A5568]">
        <span className="font-semibold text-[#1A1A2E]">{email}</span> isn't on the Referral Hub. Ask Horace or Rory for an invite.
      </p>
      <Button variant="ghost" className="mt-6 w-full" onClick={() => supabase!.auth.signOut()}>
        Sign out
      </Button>
    </AuthCard>
  );
}

function HubApp({ profile }: { profile: Profile }) {
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
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-[#F8FAFC] via-[#F8FAFC] to-[#F1F5F9] text-[#1A1A2E]">
      <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/90 shadow-[0_2px_14px_rgba(15,23,42,0.03)] backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="h-9 shadow-sm" />
            <div className="flex items-center gap-2">
              <span className="hidden text-[0.8rem] font-bold uppercase tracking-[0.14em] text-[#FF6B00] sm:inline">Referral Hub</span>
              <span className="hidden items-center gap-1.5 rounded-full border border-[#A7F3D0] bg-[#ECFDF5] px-2.5 py-0.5 text-[0.7rem] font-bold text-[#065F46] md:inline-flex">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#10B981]" />
                Live Advisor
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1A1A2E] text-[0.78rem] font-bold text-white shadow-sm">
                {(profile.full_name || profile.email).slice(0, 2).toUpperCase()}
              </div>
              <span className="hidden text-left text-[0.82rem] leading-tight sm:block">
                <span className="block font-bold text-[#1A1A2E]">{profile.full_name || profile.email}</span>
                <span className="text-[0.72rem] font-semibold text-[#64748B]">{profile.role === 'owner' ? 'Sunrun Partner' : 'Admin'}</span>
              </span>
            </div>
            <button
              onClick={() => supabase!.auth.signOut()}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#64748B] transition-all hover:border-[#1A1A2E] hover:bg-[#F8FAFC] hover:text-[#1A1A2E]"
              aria-label="Sign out"
              title="Sign out of Referral Hub"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1.5 px-3 sm:px-5" aria-label="Dashboard sections">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => go(id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[42px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-t-xl px-2.5 text-[0.86rem] font-bold transition-all sm:flex-none sm:gap-2 sm:px-5 sm:text-[0.9rem]',
                  active
                    ? 'border-b-2 border-[#FF6B00] bg-[#FFFBF7] text-[#FF6B00]'
                    : 'border-b-2 border-transparent text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#1A1A2E]',
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0 transition-transform', active && 'scale-110 text-[#FF6B00]')} />
                <span>{label}</span>
                {id === 'leads' && leads.unseen > 0 && (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#FF6B00] px-1.5 text-[0.66rem] font-extrabold leading-5 text-white shadow-sm shadow-[#FF6B00]/30">
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
          {tab === 'leads' && <LeadsTab feed={leads} />}
          {tab === 'chat' && <ChatTab profile={profile} />}
          {tab === 'files' && <FilesTab />}
          {tab === 'schedule' && <ScheduleTab profile={profile} />}
        </Suspense>
      </main>
    </div>
  );
}
