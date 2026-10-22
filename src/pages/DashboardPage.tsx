import { useEffect, useState, type FormEvent } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import ChatPanel from '../components/dashboard/ChatPanel';
import FilesPanel from '../components/dashboard/FilesPanel';
import NotConfigured, { FriendlyBoundary } from '../components/dashboard/NotConfigured';
import SchedulePanel from '../components/dashboard/SchedulePanel';
import {
  Notice,
  SiteShell,
  TopBar,
  fieldClass,
  focusRing,
  primaryButtonClass,
  secondaryButtonClass,
  useNoIndex,
  usePageTitle,
} from '../components/dashboard/ui';
import type { DashboardProfile } from '../lib/dashboard';
import { supabase } from '../lib/supabaseClient';

type TabId = 'chat' | 'files' | 'schedule';

export default function DashboardPage() {
  if (import.meta.env.DEV) {
    const flag = new URLSearchParams(window.location.search).get('preview');
    if (flag === 'login-screen') {
      return (
        <FriendlyBoundary title="Owner dashboard">
          <LoginScreen onSubmit={async () => 'Preview only. Add the Supabase keys from SETUP.md before signing in.'} />
        </FriendlyBoundary>
      );
    }
    if (flag === 'dashboard-tabs') {
      return (
        <FriendlyBoundary title="Owner dashboard">
          <DashboardShell
            profile={{
              id: 'preview',
              email: 'horace.lawrence@sunrun.com',
              role: 'owner',
              display_name: 'Horace Lawrence',
            }}
            client={null}
            preview
            onSignOut={() => undefined}
          />
        </FriendlyBoundary>
      );
    }
  }

  if (!supabase) {
    return (
      <NotConfigured
        noIndex
        eyebrow="Owner dashboard"
        title="The owner dashboard is not configured yet"
        body="Add the Supabase keys in Vercel using SETUP.md, redeploy, then refresh this page. Signing in will show up here after that."
      />
    );
  }

  return (
    <FriendlyBoundary title="Owner dashboard">
      <DashboardApp client={supabase} />
    </FriendlyBoundary>
  );
}

function DashboardApp({ client }: { client: SupabaseClient }) {
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (session: Session | null) => {
      if (!session) {
        if (!cancelled) {
          setProfile(null);
          setReady(true);
        }
        return;
      }
      const next = await fetchProfile(client, session.user.id);
      if (!next) {
        await client.auth.signOut();
        if (!cancelled) {
          setProfile(null);
          setLoginError('This account is not invited to the dashboard.');
          setReady(true);
        }
        return;
      }
      if (!cancelled) {
        setProfile(next);
        setLoginError(null);
        setReady(true);
      }
    };

    void client.auth.getSession().then(({ data }) => load(data.session));
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      void load(session);
    });
    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [client]);

  if (!ready) {
    return (
      <SiteShell>
        <TopBar />
        <p className="mx-auto max-w-5xl px-4 py-10 text-[#4A5568]">Loading the dashboard…</p>
      </SiteShell>
    );
  }
  if (!profile) {
    return <LoginScreen serverError={loginError} onSubmit={(email, password) => signIn(client, email, password)} />;
  }
  return <DashboardShell profile={profile} client={client} onSignOut={() => void client.auth.signOut()} />;
}

async function fetchProfile(client: SupabaseClient, userId: string): Promise<DashboardProfile | null> {
  const { data, error } = await client
    .from('profiles')
    .select('id, email, role, display_name')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id?: unknown; email?: unknown; role?: unknown; display_name?: unknown };
  if (typeof row.id !== 'string' || typeof row.email !== 'string') return null;
  if (row.role !== 'owner' && row.role !== 'admin') return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    display_name: typeof row.display_name === 'string' ? row.display_name : null,
  };
}

async function signIn(client: SupabaseClient, email: string, password: string): Promise<string | null> {
  try {
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (!error) return null;
    if (/invalid login/i.test(error.message)) return 'That email or password is not right.';
    if (/email not confirmed/i.test(error.message)) return 'Confirm this user in Supabase, then try again.';
    return 'Could not sign in. Check the email and password.';
  } catch {
    return 'Could not reach the sign-in service.';
  }
}

function LoginScreen({
  onSubmit,
  serverError = null,
}: {
  onSubmit: (email: string, password: string) => Promise<string | null>;
  serverError?: string | null;
}) {
  usePageTitle('Sign in — The Power Genie');
  useNoIndex();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const message = await onSubmit(email, password);
    setBusy(false);
    if (message) setError(message);
  }

  const shown = error || serverError;

  return (
    <SiteShell>
      <TopBar />
      <main className="mx-auto flex max-w-md flex-col px-4 py-16">
        <p className="m-0 text-xs font-bold uppercase tracking-[0.14em] text-[#FF6B00]">Owner dashboard</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Sign in</h1>
        <p className="mt-3 text-[#4A5568]">This page is for Horace and Rory. There is no public sign-up.</p>
        <form className="mt-6 grid gap-4 rounded-[18px] bg-white p-6 shadow-[0_12px_32px_rgba(10,20,40,0.08)]" onSubmit={(event) => void handleSubmit(event)}>
          {shown ? <Notice tone="error">{shown}</Notice> : null}
          <label className="grid gap-1 text-sm font-semibold" htmlFor="dashboard-email">
            Email
            <input
              id="dashboard-email"
              className={fieldClass}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold" htmlFor="dashboard-password">
            Password
            <input
              id="dashboard-password"
              className={fieldClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    </SiteShell>
  );
}

function DashboardShell({
  profile,
  client,
  onSignOut,
  preview = false,
}: {
  profile: DashboardProfile;
  client: SupabaseClient | null;
  onSignOut: () => void;
  preview?: boolean;
}) {
  usePageTitle('Dashboard — The Power Genie');
  useNoIndex();
  const [tab, setTab] = useState<TabId>(initialTab);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const calendar = params.get('calendar');
    if (calendar === 'connected') setBanner('Google Calendar is connected.');
    if (calendar === 'error') setBanner('Google Calendar did not connect. Try again from the Schedule tab.');
    if (!calendar) return;
    params.delete('calendar');
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
    window.history.replaceState({}, '', next);
  }, []);

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'chat', label: 'Chat' },
    { id: 'files', label: 'Files' },
    { id: 'schedule', label: 'Schedule' },
  ];

  return (
    <SiteShell>
      <TopBar
        action={(
          <button type="button" className={`rounded-full px-3 py-2 text-sm font-semibold text-white ${focusRing}`} onClick={onSignOut}>
            Sign out
          </button>
        )}
      />
      <main className="mx-auto grid max-w-5xl gap-4 px-4 py-6">
        {preview ? (
          <Notice tone="info">Local preview. Sign-in, chat, files, and calendar sync start working after Supabase is configured.</Notice>
        ) : null}
        {banner ? <Notice tone={banner.includes('did not') ? 'error' : 'ok'}>{banner}</Notice> : null}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-[0.14em] text-[#FF6B00]">Dashboard</p>
            <h1 className="m-0 mt-1 text-2xl font-bold tracking-tight">
              {profile.display_name || profile.email}
              <span className="ml-2 text-base font-semibold text-[#4A5568]">{profile.role === 'owner' ? 'Owner' : 'Admin'}</span>
            </h1>
          </div>
          <div className="flex gap-2" role="tablist" aria-label="Dashboard">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`tab-${item.id}`}
                aria-selected={tab === item.id}
                aria-controls={`panel-${item.id}`}
                className={tab === item.id ? primaryButtonClass : secondaryButtonClass}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'chat' ? <ChatPanel client={client} profile={profile} preview={preview} /> : null}
          {tab === 'files' ? <FilesPanel client={client} profile={profile} preview={preview} /> : null}
          {tab === 'schedule' ? <SchedulePanel client={client} profile={profile} preview={preview} /> : null}
        </div>
      </main>
    </SiteShell>
  );
}

function initialTab(): TabId {
  const tab = new URLSearchParams(window.location.search).get('tab');
  if (tab === 'files' || tab === 'schedule' || tab === 'chat') return tab;
  return 'chat';
}
