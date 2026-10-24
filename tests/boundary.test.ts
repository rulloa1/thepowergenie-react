import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

test('the browser bundle cannot see the service role key', () => {
  const paths = [...files('src'), ...files('shared')]
  for (const path of paths) {
    const text = readFileSync(path, 'utf8')
    assert.equal(text.includes('SUPABASE_SERVICE_ROLE_KEY'), false, path)
    assert.equal(text.includes('EXTRACT_SHARED_SECRET'), false, path)
    assert.equal(text.includes('sb_secret_'), false, path)
    assert.equal(text.includes('AI_GATEWAY_API_KEY'), false, path)
  }
})
