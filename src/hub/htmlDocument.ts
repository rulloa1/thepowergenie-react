/**
 * Storage serves .html as text/plain, so a signed URL opened directly shows
 * source. Hub members fetch the bytes and render them here. The proposal is
 * styled HTML; it does not need scripts to display.
 */

/** Pop-ups and phone links work. Scripts and same-origin access stay off. */
export const HTML_PREVIEW_SANDBOX = 'allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation';

const MAX_HTML_CHARS = 2_000_000;

export function isHtmlObjectPath(path: string): boolean {
  return /\.html?$/i.test(path);
}

export function htmlPreviewSandboxTokens(): string[] {
  return HTML_PREVIEW_SANDBOX.split(/\s+/).filter(Boolean);
}

/** Remove executable markup. Styles, text, and ordinary links stay. */
export function inertHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*>/gi, '')
    .replace(/<\/script\s*>/gi, '')
    .replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/<iframe\b[^>]*>/gi, '')
    .replace(/\s(?:href|src)\s*=\s*(["'])\s*javascript:[^"']*\1/gi, '')
    .replace(/\s(?:href|src)\s*=\s*javascript:[^\s>]*/gi, '');
}

export async function readSignedHtml(url: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  let response: Response;
  try {
    response = await fetchImpl(url, { cache: 'no-store', credentials: 'omit' });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const text = await response.text();
  if (text.length === 0 || text.length > MAX_HTML_CHARS) return null;
  if (!/<html[\s>]/i.test(text) && !/<body[\s>]/i.test(text)) return null;
  return inertHtml(text);
}

/** Opens a text/html blob. Returns false when the browser blocks the window. */
export function openHtmlBlob(html: string, print: boolean): boolean {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const opened = window.open(url, '_blank');
  if (!opened) {
    URL.revokeObjectURL(url);
    return false;
  }
  if (print) {
    let printed = false;
    const run = () => {
      if (printed) return;
      printed = true;
      try {
        opened.focus();
        opened.print();
      } catch {
        /* The new tab is still open if the print dialog is blocked. */
      }
    };
    opened.addEventListener('load', run);
    window.setTimeout(run, 500);
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
