import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenieSession } from '../server/workflow/genie.js';

test('createGenieSession returns simulated session when GEMINI_API_KEY is unset', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    const session = await createGenieSession('Suburban Texas home with solar panels');
    assert.equal(session.simulated, true);
    assert.equal(session.model, 'models/genie-4');
    assert.ok(session.interactionId.startsWith('sim-genie-'));
    assert.equal(session.authToken, 'simulated');
    assert.equal(session.expiresInSeconds, 120);
  } finally {
    if (prevKey) process.env.GEMINI_API_KEY = prevKey;
  }
});
