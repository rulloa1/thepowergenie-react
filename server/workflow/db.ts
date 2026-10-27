import { HttpError } from '../http.js'
import { supabaseFetch } from '../supabase.js'

/**
 * Small PostgREST helpers for the workflow tables. The server uses the
 * service role, so every caller checks who is asking before it gets here.
 */

export type Filters = Record<string, string>

function query(filters: Filters, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries({ ...filters, ...extra })) params.append(key, value)
  const textValue = params.toString()
  return textValue ? `?${textValue}` : ''
}

async function fail(table: string, response: Response, action: string): Promise<never> {
  const detail = await response.text().catch(() => '')
  console.error('workflow_db_failed', action, table, response.status, detail.slice(0, 300))
  if (response.status === 404 || /does not exist|schema cache/i.test(detail)) {
    throw new HttpError(503, 'The sales workflow is not set up in the database yet.')
  }
  throw new HttpError(502, 'The workflow could not reach the database. Please try again.')
}

export async function selectRows<T>(table: string, filters: Filters = {}, options: { select?: string; order?: string; limit?: number } = {}): Promise<T[]> {
  const extra: Record<string, string> = { select: options.select || '*' }
  if (options.order) extra.order = options.order
  if (options.limit) extra.limit = String(options.limit)
  const response = await supabaseFetch(`/rest/v1/${table}${query(filters, extra)}`)
  if (!response.ok) await fail(table, response, 'select')
  return (await response.json()) as T[]
}

export async function selectOne<T>(table: string, filters: Filters, select = '*'): Promise<T | null> {
  const rows = await selectRows<T>(table, filters, { select, limit: 1 })
  return rows[0] ?? null
}

export async function insertReturning<T>(table: string, row: Record<string, unknown>, onConflictIgnore = false): Promise<T | null> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    prefer: onConflictIgnore ? 'return=representation,resolution=ignore-duplicates' : 'return=representation',
  }
  const response = await supabaseFetch(`/rest/v1/${table}`, { method: 'POST', headers, body: JSON.stringify(row) })
  if (response.status === 409 && onConflictIgnore) return null
  if (!response.ok) await fail(table, response, 'insert')
  const rows = (await response.json().catch(() => [])) as T[]
  return rows[0] ?? null
}

export async function upsertRow(table: string, row: Record<string, unknown>, conflict: string): Promise<void> {
  const response = await supabaseFetch(`/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  })
  if (!response.ok) await fail(table, response, 'upsert')
}

export async function patchRows(table: string, filters: Filters, patch: Record<string, unknown>): Promise<number> {
  const response = await supabaseFetch(`/rest/v1/${table}${query(filters)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
  if (!response.ok) await fail(table, response, 'update')
  const rows = (await response.json().catch(() => [])) as unknown[]
  return rows.length
}

/** PostgREST `in.(...)` filter value for text ids. */
export function inList(values: string[]): string {
  return `in.(${values.map(value => `"${value.replace(/"/g, '')}"`).join(',')})`
}
