import os

dashboard_path = os.path.join('src', 'hub', 'Dashboard.tsx')
with open(dashboard_path, 'r', encoding='utf-8') as f:
    text = f.read()

text_norm = text.replace('\r\n', '\n')

demo_profile_code = """export interface Profile {
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
};"""

text_norm = text_norm.replace(
    """export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: 'owner' | 'admin';
}""",
    demo_profile_code
)

old_dash_start = """export default function Dashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [needsPassword, setNeedsPassword] = useState(arrivalAuthType === 'invite' || arrivalAuthType === 'recovery');"""

new_dash_start = """export default function Dashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [needsPassword, setNeedsPassword] = useState(arrivalAuthType === 'invite' || arrivalAuthType === 'recovery');
  const [isDemo, setIsDemo] = useState(() => {
    return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === 'true';
  });"""

text_norm = text_norm.replace(old_dash_start, new_dash_start)

old_dash_returns = """  if (!supabase) return <NotConfigured what="The Referral Hub" />;
  if (!ready) return <FullPageSpinner />;
  if (!session) return <SignIn />;
  if (needsPassword) return <SetPassword onDone={() => setNeedsPassword(false)} />;
  if (profile === undefined) return <FullPageSpinner />;
  if (profile === null) return <NotInvited email={session.user.email ?? ''} />;
  return <HubApp profile={profile} />;"""

new_dash_returns = """  if (isDemo) {
    return <HubApp profile={DEMO_PROFILE} isDemo onExitDemo={() => setIsDemo(false)} />;
  }
  if (!supabase) return <NotConfigured what="The Referral Hub" />;
  if (!ready) return <FullPageSpinner />;
  if (!session) return <SignIn onExploreDemo={() => setIsDemo(true)} />;
  if (needsPassword) return <SetPassword onDone={() => setNeedsPassword(false)} />;
  if (profile === undefined) return <FullPageSpinner />;
  if (profile === null) return <NotInvited email={session.user.email ?? ''} />;
  return <HubApp profile={profile} />;"""

text_norm = text_norm.replace(old_dash_returns, new_dash_returns)

# Update SignIn component signature and body
old_signin = """function SignIn() {
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
        <p className="m-0 text-center text-[0.8rem] text-hub-soft">Access is by invitation only.</p>
      </form>
    </AuthCard>
  );
}"""

new_signin = """function SignIn({ onExploreDemo }: { onExploreDemo?: () => void }) {
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
              className="w-full text-xs font-bold text-[#FF6B00] border border-orange-300 bg-orange-50/70 hover:bg-orange-100/70"
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
}"""

text_norm = text_norm.replace(old_signin, new_signin)

# Update HubApp signature and header
old_hubapp_start = """function HubApp({ profile }: { profile: Profile }) {"""
new_hubapp_start = """function HubApp({
  profile,
  isDemo = false,
  onExitDemo,
}: {
  profile: Profile;
  isDemo?: boolean;
  onExitDemo?: () => void;
}) {"""
text_norm = text_norm.replace(old_hubapp_start, new_hubapp_start)

old_header_content = """        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="h-9 shadow-sm" />
            <div className="flex items-center gap-2">
              <span className="hidden text-[0.8rem] font-bold uppercase tracking-[0.14em] text-hub-accent-ink sm:inline">Referral Hub</span>
              <span className="hidden items-center gap-1.5 rounded-full border border-hub-success-line bg-hub-success px-2.5 py-0.5 text-[0.7rem] font-bold text-hub-success-ink md:inline-flex">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-hub-success-ink" />
                Live Advisor
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-hub-primary text-[0.78rem] font-bold text-hub-on-primary shadow-sm">
                {(profile.full_name || profile.email).slice(0, 2).toUpperCase()}
              </div>
              <span className="hidden text-left text-[0.82rem] leading-tight sm:block">
                <span className="block font-bold text-hub-ink">{profile.full_name || profile.email}</span>
                <span className="text-[0.72rem] font-semibold text-hub-soft">{profile.role === 'owner' ? 'Sunrun Partner' : 'Admin'}</span>
              </span>
            </div>
            <button
              onClick={() => supabase!.auth.signOut()}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-hub-control bg-hub-surface text-hub-soft transition-all hover:border-hub-ink hover:bg-hub-muted hover:text-hub-ink"
              aria-label="Sign out"
              title="Sign out of Referral Hub"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>"""

new_header_content = """        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/" className="transition-opacity hover:opacity-80" title="Return to The Power Genie Home">
              <BrandMark className="h-9 shadow-sm" />
            </a>
            <div className="flex items-center gap-2">
              <span className="hidden text-[0.8rem] font-bold uppercase tracking-[0.14em] text-hub-accent-ink sm:inline">Referral Hub</span>
              <span className="hidden items-center gap-1.5 rounded-full border border-hub-success-line bg-hub-success px-2.5 py-0.5 text-[0.7rem] font-bold text-hub-success-ink md:inline-flex">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-hub-success-ink" />
                Live Advisor
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <a
              href="/"
              className="hidden lg:inline-flex items-center gap-1 text-[0.78rem] font-semibold text-hub-soft hover:text-hub-ink transition-colors px-2.5 py-1 rounded-lg border border-hub-control bg-hub-surface no-underline"
            >
              ← Public Site
            </a>
            <a
              href="/homeowner"
              className="hidden sm:inline-flex items-center gap-1 text-[0.78rem] font-bold text-[#FF6B00] hover:text-[#FF6B00]/80 transition-colors px-2.5 py-1 rounded-lg border border-orange-200 bg-orange-50/70 no-underline"
            >
              🔋 Homeowner Portal
            </a>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-hub-primary text-[0.78rem] font-bold text-hub-on-primary shadow-sm">
                {(profile.full_name || profile.email).slice(0, 2).toUpperCase()}
              </div>
              <span className="hidden text-left text-[0.82rem] leading-tight sm:block">
                <span className="block font-bold text-hub-ink">{profile.full_name || profile.email}</span>
                <span className="text-[0.72rem] font-semibold text-hub-soft">{profile.role === 'owner' ? 'Sunrun Partner' : 'Admin'}</span>
              </span>
            </div>
            {isDemo ? (
              <button
                onClick={onExitDemo}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-orange-300 bg-orange-50 text-[0.78rem] font-bold text-[#FF6B00] transition-all hover:bg-orange-100 cursor-pointer"
                title="Exit Demo Mode"
              >
                Exit Demo
              </button>
            ) : (
              <button
                onClick={() => supabase!.auth.signOut()}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-hub-control bg-hub-surface text-hub-soft transition-all hover:border-hub-ink hover:bg-hub-muted hover:text-hub-ink cursor-pointer"
                aria-label="Sign out"
                title="Sign out of Referral Hub"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>"""

text_norm = text_norm.replace(old_header_content, new_header_content)

# Add demo banner right below header
old_banner_anchor = """      <header className=\"sticky top-0 z-30 border-b border-hub-line bg-hub-topbar shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md\">"""
new_banner = """      {isDemo && (
        <div className=\"sticky top-0 z-40 bg-gradient-to-r from-orange-500/15 via-amber-500/15 to-orange-500/15 border-b border-orange-200/80 px-4 py-2 text-center text-[0.82rem] text-hub-ink backdrop-blur-md flex items-center justify-center gap-2\">
          <span className=\"font-bold text-[#FF6B00]\">✨ Demo Mode:</span>
          <span>Viewing live preview of Horace Lawrence's Sunrun Partner Workspace. Interactive leads, AI advisor, files, and scheduling tools.</span>
          <button onClick={onExitDemo} className=\"ml-2 text-xs font-bold underline text-[#FF6B00] hover:text-[#E65100] cursor-pointer\">Exit to Sign In</button>
        </div>
      )}
      <header className=\"sticky top-0 z-30 border-b border-hub-line bg-hub-topbar shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md\">"""

text_norm = text_norm.replace(old_banner_anchor, new_banner)

with open(dashboard_path, 'w', encoding='utf-8') as f:
    f.write(text_norm)

print('Dashboard.tsx successfully updated!')
