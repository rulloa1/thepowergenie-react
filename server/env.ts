export type ServerEnv = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  googleClientId: string | null;
  googleClientSecret: string | null;
  googleRedirectUri: string | null;
  publicSiteUrl: string | null;
};

export type GoogleEnv = ServerEnv & {
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  publicSiteUrl: string;
};

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function readServerEnv(): ServerEnv | null {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  const site = (process.env.PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    googleClientId: blankToNull(process.env.GOOGLE_CLIENT_ID),
    googleClientSecret: blankToNull(process.env.GOOGLE_CLIENT_SECRET),
    googleRedirectUri: blankToNull(process.env.GOOGLE_REDIRECT_URI),
    publicSiteUrl: site || null,
  };
}

export function googleReady(env: ServerEnv): env is GoogleEnv {
  return Boolean(
    env.googleClientId &&
      env.googleClientSecret &&
      env.googleRedirectUri &&
      env.publicSiteUrl,
  );
}

export function siteOrigin(site: string | null): string | null {
  if (!site) return null;
  try {
    const url = new URL(site);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}
