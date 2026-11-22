import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dashboardLoginEmail } from '../shared/hub-login.js'

test('ThePowerGenie uses Horace’s existing account with case-insensitive username', () => {
  assert.equal(dashboardLoginEmail('ThePowerGenie'), 'powergeniesunrun@gmail.com')
  assert.equal(dashboardLoginEmail(' THEPOWERGENIE '), 'powergeniesunrun@gmail.com')
  assert.equal(dashboardLoginEmail(' Other@Example.com '), 'other@example.com')
  assert.equal(dashboardLoginEmail('another-user'), 'another-user')
})
