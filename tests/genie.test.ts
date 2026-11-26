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

test('genie sync payload encodes and parses reliably for LiveKit data packets', () => {
  const syncState = {
    weatherPreset: 'sunset' as const,
    cameraYaw: 0.785,
    cameraPitch: 0.12,
    cameraX: 2.4,
    cameraY: -1.2,
    cameraZ: -5.0,
    steeringText: 'golden hour sunset',
  };

  const json = JSON.stringify({ type: 'pg-genie-state', state: syncState });
  const parsed = JSON.parse(json);
  assert.equal(parsed.type, 'pg-genie-state');
  assert.equal(parsed.state.weatherPreset, 'sunset');
  assert.equal(parsed.state.cameraYaw, 0.785);
  assert.equal(parsed.state.cameraPitch, 0.12);
  assert.equal(parsed.state.cameraX, 2.4);
  assert.equal(parsed.state.steeringText, 'golden hour sunset');
});
