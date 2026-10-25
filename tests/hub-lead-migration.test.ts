import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildArchivePatch, buildCustomerUpdate, buildManualCustomerInsert, emptyDraft } from '../src/hub/leadRecord'

const sql = readFileSync(new URL('../supabase/migrations/20261025180000_hub_manual_leads.sql', import.meta.url), 'utf8')

function grantList(kind: 'insert' | 'update', table: string): string {
  const match = sql.match(new RegExp(`grant ${kind} \\(([\\s\\S]*?)\\) on table public\\.${table}`, 'i'))
  assert.ok(match, `${kind} grant for ${table}`)
  return match[1]
}

const actor = { id: '11111111-1111-4111-8111-111111111111', fullName: 'Horace Lawrence', email: 'horace.lawrence@sunrun.com' }
const now = new Date('2026-10-25T15:00:00.000Z')

test('the migration only adds archive columns and does not rewrite lead rows', () => {
  assert.match(sql, /add column if not exists archived_at text/)
  assert.match(sql, /add column if not exists archived_by text/)
  assert.doesNotMatch(sql, /update\s+public\.powergenie_customers/i)
  assert.doesNotMatch(sql, /delete\s+from\s+public\.powergenie_customers/i)
  assert.doesNotMatch(sql, /drop\s+column/i)
  assert.doesNotMatch(sql, /grant\s+[^\n]*\s+to\s+anon/i)
  assert.match(sql, /is_hub_member\(\)/)
  assert.doesNotMatch(sql, /for delete/)
})

test('hub members can insert and update the fields the form writes, and cannot change identity or the appointment', () => {
  const draft = { ...emptyDraft(), name: 'Casey Nguyen', address: '18 Maple Street, Houston, TX 77008' }
  const insertGrant = grantList('insert', 'powergenie_customers')
  const updateGrant = grantList('update', 'powergenie_customers')
  for (const key of Object.keys(buildManualCustomerInsert(draft, actor, now, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))) {
    assert.match(insertGrant, new RegExp(`\\b${key}\\b`), key)
  }
  for (const key of Object.keys(buildCustomerUpdate(draft, now))) {
    assert.match(updateGrant, new RegExp(`\\b${key}\\b`), key)
  }
  for (const key of Object.keys(buildArchivePatch(actor, now))) {
    assert.match(updateGrant, new RegExp(`\\b${key}\\b`), key)
  }
  assert.doesNotMatch(updateGrant, /\bcreated_by\b/)
  assert.doesNotMatch(updateGrant, /\bcreated_at\b/)
  assert.doesNotMatch(updateGrant, /\blogged_on\b/)
  assert.doesNotMatch(updateGrant, /\bappointment_date\b/)
  assert.doesNotMatch(updateGrant, /\bdate_sent_to_horace\b/)
  assert.match(sql, /created_by = 'manual:' \|\| \(select auth\.uid\(\)\)::text/)
  assert.match(sql, /category = 'light_bill'/)
  assert.match(sql, /bucket_id = 'powergenie'/)
})
