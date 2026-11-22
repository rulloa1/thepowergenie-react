import { powerGenieEmail } from '../shared/hub-access.js'
import { HttpError, isRecord, json, readWebJson } from './http.js'
import { supabaseConfig, supabaseFetch, supabaseRequest } from './supabase.js'

export async function handleHubAccess(request: Request): Promise<Response> {
  const token = request.headers.get('authorization') || ''
  if (!token) {
    const body = await readWebJson(request, 2000)
    if (!isRecord(body) || typeof body.email !== 'string' || !powerGenieEmail(body.email)) {
      throw new HttpError(403, 'A Power Genie email is required.')
    }
    const created = await supabaseFetch('/auth/v1/admin/users', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: body.email.trim().toLowerCase(), email_confirm: false }),
    })
    if (!created.ok) {
      const problem = await created.json().catch(() => null) as { code?: string; error_code?: string } | null
      if (!['email_exists', 'user_already_exists'].includes(problem?.code || problem?.error_code || '')) {
        throw new HttpError(503, 'Could not prepare sign-in. Please try again.')
      }
    }
    return json({ ok: true })
  }
  if (!/^Bearer \S+$/i.test(token)) throw new HttpError(401, 'Please sign in first.')
  const { url, key } = supabaseConfig()
  const response = await supabaseRequest(`${url}/auth/v1/user`, {
    headers: { apikey: key, authorization: token, 'user-agent': 'PowerGenieWebsite/1.0' },
  })
  if (!response.ok) throw new HttpError(401, 'Please sign in again.')
  const user = await response.json() as { id?: string; email?: string; email_confirmed_at?: string }
  if (!user.id || !user.email_confirmed_at || !powerGenieEmail(user.email || '')) {
    throw new HttpError(403, 'A verified Power Genie email is required.')
  }
  const profile = { id: user.id, email: user.email!.toLowerCase(), role: 'owner' }
  const saved = await supabaseFetch('/rest/v1/hub_profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json', prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(profile),
  })
  if (!saved.ok) throw new HttpError(503, 'Could not activate dashboard access. Please try again.')
  return json({ ok: true })
}
