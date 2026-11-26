import { GoogleGenAI } from '@google/genai';

export interface GenieSessionResult {
  interactionId: string;
  authToken: string;
  simulated: boolean;
  model: string;
  expiresInSeconds?: number;
}

export function geminiApiKey(): string {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || '').trim();
}

/**
 * Creates a stateful Genie 4 Live Interaction session and mints an ephemeral auth token
 * scoped to this session so client browsers never receive the server's GEMINI_API_KEY.
 * Falls back gracefully to simulated 3D world mode if no key is provisioned or paid tier is unavailable.
 */
export async function createGenieSession(prompt?: string): Promise<GenieSessionResult> {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    return {
      interactionId: `sim-genie-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      authToken: 'simulated',
      simulated: true,
      model: 'models/genie-4',
      expiresInSeconds: 120,
    };
  }

  try {
    const serverAi = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1beta',
    });

    const interaction = await serverAi.interactions.create(
      {
        model: 'models/genie-4',
        api_version: 'v1beta',
      },
      { timeout_ms: 30_000 },
    );

    try {
      const tokenResp = await serverAi.interactions.authTokens.create(
        interaction.id,
        { api_version: 'v1beta' },
        { timeout_ms: 30_000 },
      );

      if (!tokenResp.auth_token) {
        throw new Error('No auth_token returned from interactions.authTokens.create');
      }

      return {
        interactionId: interaction.id,
        authToken: tokenResp.auth_token,
        simulated: false,
        model: 'models/genie-4',
        expiresInSeconds: 120,
      };
    } catch (err) {
      await serverAi.interactions
        .cancel(interaction.id, { api_version: 'v1beta' }, { timeout_ms: 15_000 })
        .catch(() => {});
      throw err;
    }
  } catch (error) {
    console.warn(
      '[genie-4] Live interaction session creation unavailable, falling back to simulated 3D world:',
      error instanceof Error ? error.message : error,
    );
    return {
      interactionId: `sim-genie-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      authToken: 'simulated',
      simulated: true,
      model: 'models/genie-4',
      expiresInSeconds: 120,
    };
  }
}
