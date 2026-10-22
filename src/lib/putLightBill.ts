import { isSignedUploadUrl } from './lightBill.js';
import { supabaseAnonKey, supabaseUrl } from './supabaseClient.js';

export function canPutLightBill(signedUrl: string): boolean {
  if (!supabaseUrl) return false;
  return isSignedUploadUrl(signedUrl, supabaseUrl);
}

export async function putLightBill(file: File, signedUrl: string): Promise<boolean> {
  if (!canPutLightBill(signedUrl)) return false;
  const body = new FormData();
  body.append('cacheControl', '3600');
  body.append('', file);
  const headers: Record<string, string> = { 'x-upsert': 'false' };
  if (supabaseAnonKey) {
    headers.apikey = supabaseAnonKey;
    headers.Authorization = `Bearer ${supabaseAnonKey}`;
  }
  try {
    const response = await fetch(signedUrl, { method: 'PUT', body, headers });
    return response.ok;
  } catch {
    return false;
  }
}
