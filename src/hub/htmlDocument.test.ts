import { describe, expect, it } from 'vitest';
import {
  HTML_PREVIEW_SANDBOX,
  htmlPreviewSandboxTokens,
  inertHtml,
  isHtmlObjectPath,
  readSignedHtml,
} from './htmlDocument';

describe('html proposal preview', () => {
  it('treats only html objects as documents to render', () => {
    expect(isHtmlObjectPath('customers/example/sunrun-proposal.html')).toBe(true);
    expect(isHtmlObjectPath('customers/example/notes.HTML')).toBe(true);
    expect(isHtmlObjectPath('customers/example/solar-plan.jpg')).toBe(false);
    expect(isHtmlObjectPath('customers/example/entergy-bill.png')).toBe(false);
  });

  it('keeps the preview sandbox free of scripts and same-origin access', () => {
    const tokens = htmlPreviewSandboxTokens();
    expect(tokens).toEqual(HTML_PREVIEW_SANDBOX.split(' '));
    expect(tokens).not.toContain('allow-scripts');
    expect(tokens).not.toContain('allow-same-origin');
    expect(tokens).toContain('allow-popups');
  });

  it('strips scripts and inline handlers and keeps the styled document', () => {
    const cleaned = inertHtml(
      '<html><head><style>body{color:red}</style><script>alert(1)</script></head><body><button onclick="window.print()">Print</button><p>Hello</p><iframe src="https://evil.example"></iframe></body></html>',
    );
    expect(cleaned).not.toContain('<script');
    expect(cleaned).not.toContain('alert');
    expect(cleaned).not.toContain('onclick');
    expect(cleaned).not.toContain('<iframe');
    expect(cleaned).toContain('<style>body{color:red}</style>');
    expect(cleaned).toContain('<p>Hello</p>');
    expect(cleaned).toContain('>Print</button>');
    const linked = inertHtml('<html><body><a href="javascript:alert(1)">Bad</a><a href="https://example.com">Ok</a></body></html>');
    expect(linked).not.toContain('javascript:');
    expect(linked).toContain('href="https://example.com"');
  });

  it('reads a signed html url and rejects anything else', async () => {
    const html = '<html><body><p>Proposal</p><script>steal()</script></body></html>';
    const fetchImpl = (async () => new Response(html, { status: 200 })) as typeof fetch;
    const read = await readSignedHtml('https://storage.example/object?token=1', fetchImpl);
    expect(read).toContain('<p>Proposal</p>');
    expect(read).not.toContain('steal');

    const missing = (async () => new Response('nope', { status: 404 })) as typeof fetch;
    expect(await readSignedHtml('https://storage.example/missing', missing)).toBeNull();
    expect(await readSignedHtml('javascript:alert(1)', fetchImpl)).toBeNull();
    const plain = (async () => new Response('not a document', { status: 200 })) as typeof fetch;
    expect(await readSignedHtml('https://storage.example/plain', plain)).toBeNull();
  });
});
