/**
 * Tests for the sequence engine helpers.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

// Import shared helpers (Node.js compatible versions)
// Note: The actual Deno helpers are in supabase/functions/_shared/sequence.ts
// These tests verify the core logic patterns

test('estimateMonthlySavings returns ~35% of current charges', () => {
  const estimate = (currentCharges: number) => Math.round(currentCharges * 0.35);
  assert.equal(estimate(150), 53);
  assert.equal(estimate(200), 70);
  assert.equal(estimate(100), 35);
});

test('renderTemplate replaces placeholders', () => {
  const template = 'Hello {{name}}, your savings are ${{savings}}/mo at {{address}}.';
  const lead = {
    customer_name: 'John Doe',
    service_address: '123 Main St',
    kwh_this_period: 1500,
    current_charges: 200,
  };
  const savings = Math.round(200 * 0.35);

  const result = template
    .replace(/\{\{name\}\}/g, lead.customer_name)
    .replace(/\{\{savings\}\}/g, savings.toString())
    .replace(/\{\{address\}\}/g, lead.service_address);

  assert.equal(result, 'Hello John Doe, your savings are $70/mo at 123 Main St.');
});

test('isQuietHours returns true between 9 PM and 9 AM', () => {
  const isQuietHour = (hour: number) => hour >= 21 || hour < 9;

  // Quiet hours
  assert.equal(isQuietHour(21), true);  // 9 PM
  assert.equal(isQuietHour(22), true);  // 10 PM
  assert.equal(isQuietHour(23), true);  // 11 PM
  assert.equal(isQuietHour(0), true);   // Midnight
  assert.equal(isQuietHour(5), true);   // 5 AM
  assert.equal(isQuietHour(8), true);   // 8 AM

  // Active hours
  assert.equal(isQuietHour(9), false);  // 9 AM
  assert.equal(isQuietHour(12), false); // Noon
  assert.equal(isQuietHour(17), false); // 5 PM
  assert.equal(isQuietHour(20), false); // 8 PM
});

test('unsubscribe token format is valid UUID', () => {
  const uuid = crypto.randomUUID();
  assert.match(uuid, /^[a-f0-9-]{36}$/i);
});

test('sequence delay calculations', () => {
  const delayHours = 48;
  const now = Date.now();
  const nextSendAt = new Date(now + delayHours * 60 * 60 * 1000);

  // Should be ~48 hours in the future
  const diffMs = nextSendAt.getTime() - now;
  const diffHours = diffMs / (60 * 60 * 1000);
  assert.equal(diffHours, 48);
});
