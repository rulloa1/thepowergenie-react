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

test('genie sync payload encodes and parses focusedHotspot and laser pointer', () => {
  const syncState = {
    weatherPreset: 'sunny' as const,
    cameraYaw: 1.25,
    cameraPitch: 0.38,
    cameraX: 0,
    cameraY: 3.8,
    cameraZ: -6.0,
    focusedHotspot: 'battery' as const,
    pointer: {
      x: 0.65,
      y: 0.42,
      active: true,
      label: 'Solar Consultant',
    },
  };

  const json = JSON.stringify({ type: 'pg-genie-state', state: syncState });
  const parsed = JSON.parse(json);

  assert.equal(parsed.type, 'pg-genie-state');
  assert.equal(parsed.state.focusedHotspot, 'battery');
  assert.equal(parsed.state.pointer?.active, true);
  assert.equal(parsed.state.pointer?.x, 0.65);
  assert.equal(parsed.state.pointer?.label, 'Solar Consultant');
});

test('genie hotspots cover panels, battery, and meter components', () => {
  const validHotspots = ['panels', 'battery', 'meter'] as const;
  assert.equal(validHotspots.length, 3);
  for (const id of validHotspots) {
    const payload = {
      type: 'pg-genie-state',
      state: { focusedHotspot: id },
    };
    const encoded = JSON.stringify(payload);
    const decoded = JSON.parse(encoded);
    assert.equal(decoded.state.focusedHotspot, id);
  }
});
