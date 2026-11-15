import { HttpError } from './http.js'
import { supabaseConfig, supabaseFetch, supabaseRequest } from './supabase.js'

export type HubMember = {
  id: string
  email: string
  role: 'owner' | 'admin'
  fullName: string | null
}

function bearer(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
}

/**
 * Confirms the caller is a signed-in Referral Hub member.
 * Uses the service role only on the server, after the user's access token
 * is checked with Auth. Anonymous callers are rejected before any lookup.
 */
export async function requireHubMember(request: Request): Promise<HubMember> {
  const token = bearer(request)
  if (!token) throw new HttpError(401, 'Please sign in to the dashboard.')
  const { url, key } = supabaseConfig()
  const userResponse = await supabaseRequest(`${url}/auth/v1/user`, {
    headers: {
      apikey: key,
      authorization: `Bearer ${token}`,
      'user-agent': 'PowerGenieWebsite/1.0',
    },
  })
  if (!userResponse.ok) throw new HttpError(401, 'Please sign in to the dashboard.')
  const user = await userResponse.json().catch(() => null) as { id?: unknown } | null
  const id = typeof user?.id === 'string' ? user.id : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new HttpError(401, 'Please sign in to the dashboard.')
  }
  const profileResponse = await supabaseFetch(
    `/rest/v1/hub_profiles?id=eq.${encodeURIComponent(id)}&select=id,email,role,full_name`,
    { headers: { accept: 'application/vnd.pgrst.object+json' } },
  )
  if (profileResponse.status === 406) throw new HttpError(403, 'This account is not on the Referral Hub.')
  if (!profileResponse.ok) throw new HttpError(401, 'Please sign in to the dashboard.')
  const profile = await profileResponse.json().catch(() => null) as {
    id?: unknown
    email?: unknown
    role?: unknown
    full_name?: unknown
  } | null
  if (!profile || profile.id !== id) throw new HttpError(403, 'This account is not on the Referral Hub.')
  if (profile.role !== 'owner' && profile.role !== 'admin') {
    throw new HttpError(403, 'This account is not on the Referral Hub.')
  }
  return {
    id,
    email: typeof profile.email === 'string' ? profile.email : '',
    role: profile.role,
    fullName: typeof profile.full_name === 'string' ? profile.full_name : null,
  }
}
