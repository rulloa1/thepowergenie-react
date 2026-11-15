export type ConferenceProblem = 'database_key' | 'livekit';

const DATABASE_KEY = /database key|placeholder|SUPABASE_SERVICE_ROLE|Scheduling is not configured/i;

/** A failed status check is a database-key problem only when the server says so. */
export function classifyConferenceProblem(input: {
  configured: boolean;
  problem?: string | null;
  error?: string | null;
}): ConferenceProblem | null {
  if (input.configured) return null;
  if (input.problem === 'database_key' || input.problem === 'livekit') return input.problem;
  if (DATABASE_KEY.test(input.error || '')) return 'database_key';
  return 'livekit';
}

export function conferenceProblemCopy(problem: ConferenceProblem, error: string | null): { title: string; body: string } {
  if (problem === 'database_key') {
    return {
      title: 'Database key is not ready',
      body: 'The dashboard database key is missing or still a placeholder. On Vercel, replace it with the real Supabase service role key, then redeploy. This is not a LiveKit key.',
    };
  }
  return {
    title: 'LiveKit is not ready',
    body: error || 'Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET on Vercel (Production), then redeploy. LIVEKIT_URL is already wss://thepowergenie-conference-room-m4nzqnpy.livekit.cloud. Do not put the secret in a VITE_ variable.',
  };
}
