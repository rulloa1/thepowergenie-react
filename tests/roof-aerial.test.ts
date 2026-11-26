import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepareRoofAerial } from '../server/workflow/aerial.js'
import { handleWorkflow } from '../server/workflow/routes.js'
import { buildDefaultRoofDesign, parseRoofDesignFromNotes, serializeRoofDesign } from '../src/hub/roofDesign.js'

test('roof aerial preparation rejects unverified addresses and keeps mapping access private', async t => {
  const fetchBefore = globalThis.fetch
  const envBefore = { ...process.env }
  const key = 'private-test-key'
  const precise = { status: 'OK', results: [{ formatted_address: '123 Test Street, Houston, TX', geometry: { location_type: 'ROOFTOP', location: { lat: 29.75, lng: -95.36 } } }] }
  try {
    await t.test('anonymous callers cannot request imagery', async () => {
      let calls = 0
      globalThis.fetch = async () => { calls++; throw new Error('unexpected network') }
      const request = new Request('https://site.test/api/assistant?route=workflow&action=aerial', { method: 'POST', body: JSON.stringify({ leadId: 'lead-test' }) })
      await assert.rejects(handleWorkflow(request, new URL(request.url)), /sign in/)
      assert.equal(calls, 0)
    })
    await t.test('missing address and missing configuration never produce a fake aerial', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY
      delete process.env.GOOGLE_SOLAR_API_KEY
      await assert.rejects(prepareRoofAerial(null), /full street address/)
      await assert.rejects(prepareRoofAerial('123 Test Street, Houston, TX'), /configured/)
    })
    process.env.GOOGLE_MAPS_API_KEY = key
    await t.test('partial and approximate matches stop before an image is requested', async () => {
      for (const place of [{ ...precise.results[0], partial_match: true }, { ...precise.results[0], geometry: { ...precise.results[0].geometry, location_type: 'APPROXIMATE' } }]) {
        let calls = 0
        globalThis.fetch = async () => { calls++; return Response.json({ status: 'OK', results: [place] }) }
        await assert.rejects(prepareRoofAerial('123 Test Street, Houston, TX'), /precise property/)
        assert.equal(calls, 1)
      }
    })
    await t.test('provider denial is a configuration error, never a prepared image', async () => {
      globalThis.fetch = async () => Response.json({ status: 'REQUEST_DENIED', error_message: key })
      await assert.rejects(prepareRoofAerial('123 Test Street, Houston, TX'), error => {
        assert.equal((error as { status: number }).status, 503)
        assert.equal(String(error).includes(key), false)
        return true
      })
    })
    await t.test('successful lookup requests north-up satellite imagery and never returns the key', async () => {
      globalThis.fetch = async input => {
        const url = new URL(String(input))
        assert.equal(url.origin, 'https://maps.googleapis.com')
        if (url.pathname.includes('geocode')) return Response.json(precise)
        assert.equal(url.searchParams.get('maptype'), 'satellite')
        assert.equal(url.searchParams.get('zoom'), '20')
        assert.equal(url.searchParams.get('scale'), '2')
        assert.equal(url.searchParams.get('format'), 'jpg')
        return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })
      }
      const data = await prepareRoofAerial('123 Test Street, Houston, TX')
      assert.equal(data.source, 'Google Maps satellite')
      assert.match(data.imageDataUrl, /^data:image\/png;base64,/)
      assert.equal(JSON.stringify(data).includes(key), false)
    })
    await t.test('a failed image response is never marked prepared', async () => {
      globalThis.fetch = async input => String(input).includes('geocode') ? Response.json(precise) : new Response('Service unavailable', { status: 403 })
      await assert.rejects(prepareRoofAerial('123 Test Street, Houston, TX'), /Satellite imagery could not be prepared/)
    })
    await t.test('the property review survives saving and reopening the roof design', () => {
      const aerial = { address: '123 Test Street, Houston, TX', source: 'Google Maps satellite' as const, preparedAt: '2026-11-24T12:00:00Z', verifiedAt: '2026-11-24T12:01:00Z' }
      const spec = { ...buildDefaultRoofDesign(aerial.address, 12000, null, 'lead-test', 'Fixture'), aerial }
      assert.deepEqual(parseRoofDesignFromNotes(serializeRoofDesign(spec))?.aerial, aerial)
    })
    await t.test('a logged-in request uses the saved customer address rather than a posted replacement', async () => {
      process.env.SUPABASE_URL = 'https://aerial.test'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test'
      const id = '00000000-0000-4000-8000-000000000041'
      globalThis.fetch = async (input, init) => {
        const url = new URL(String(input))
        if (url.pathname.endsWith('/auth/v1/user')) return Response.json({ id })
        if (url.pathname.includes('hub_profiles')) return Response.json({ id, role: 'owner', email: 'fixture@example.com', full_name: 'Fixture' })
        if (url.pathname.includes('powergenie_customers')) { assert.notEqual(init?.method, 'POST'); return Response.json([{ service_address: '123 Saved Street, Houston, TX' }]) }
        if (url.pathname.includes('geocode')) { assert.equal(url.searchParams.get('address'), '123 Saved Street, Houston, TX'); return Response.json(precise) }
        if (url.pathname.includes('staticmap')) return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })
        throw new Error('Unexpected service request')
      }
      const request = new Request('https://site.test/api/assistant?route=workflow&action=aerial', { method: 'POST', headers: { authorization: 'Bearer fixture-session', origin: 'https://site.test', 'content-type': 'application/json' }, body: JSON.stringify({ leadId: 'lead-test', address: '999 Posted Address' }) })
      const response = await handleWorkflow(request, new URL(request.url))
      assert.equal(response.status, 200)
      assert.equal((await response.json()).address, '123 Saved Street, Houston, TX')
      assert.equal(response.headers.get('cache-control'), 'no-store')
    })
  } finally {
    globalThis.fetch = fetchBefore
    for (const name of Object.keys(process.env)) if (!(name in envBefore)) delete process.env[name]
    Object.assign(process.env, envBefore)
  }
})
