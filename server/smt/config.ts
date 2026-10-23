import { SMT_PRODUCTION_BASE } from '../../src/lib/smt';

export type SmtConfig = {
  base: string;
  username: string;
  portalPassword: string;
  requestorId: string;
  duns: string;
  token: string | null;
  cert: string | null;
  key: string | null;
};

function blank(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function pem(value: string | null): string | null {
  if (!value) return null;
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

export function readSmtConfig(): SmtConfig | null {
  const username = blank(process.env.SMT_USERNAME);
  const portalPassword = blank(process.env.SMT_PASSWORD);
  const requestorId = blank(process.env.SMT_REQUESTOR_ID);
  const duns = blank(process.env.SMT_DUNS);
  const token = blank(process.env.SMT_API_TOKEN);
  if (!username || !portalPassword || !requestorId || !duns || !token) return null;
  if (requestorId.length > 32 || duns.length > 18) return null;
  let base = SMT_PRODUCTION_BASE;
  const configured = blank(process.env.SMT_API_BASE);
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol !== 'https:') return null;
      base = url.origin;
    } catch {
      return null;
    }
  }
  return {
    base,
    username,
    portalPassword,
    requestorId,
    duns,
    token,
    cert: pem(blank(process.env.SMT_CLIENT_CERT)),
    key: pem(blank(process.env.SMT_CLIENT_KEY)),
  };
}
