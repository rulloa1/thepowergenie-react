import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

function decl(name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`missing ${name}`);
  return match[1].trim();
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

/** sRGB color-mix, matching the percentages in src/index.css. */
function mix(base: string, tint: string, tintAmount: number): string {
  const parse = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16));
  const a = parse(base);
  const b = parse(tint);
  const channels = a.map((part, i) => Math.round(part * (1 - tintAmount) + b[i] * tintAmount));
  return `#${channels.map((part) => part.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

describe('referral hub theme tokens', () => {
  it('keeps the marketing journey tokens and points the hub at them', () => {
    expect(decl('--sw-bg')).toBe('#E8F4FD');
    expect(decl('--sw-ink')).toBe('#1A1A2E');
    expect(decl('--sw-ink-soft')).toBe('#4A5568');
    expect(decl('--sw-accent')).toBe('#0066CC');
    expect(decl('--pg-orange')).toBe('#FF6B00');
    expect(decl('--pg-green')).toBe('#4CAF50');
    expect(decl('--pg-navy')).toBe('#0B2233');
    expect(decl('--pg-logo')).toBe('#071b27');
    expect(decl('--hub-bg')).toBe('var(--sw-bg)');
    expect(decl('--hub-ink')).toBe('var(--sw-ink)');
    expect(decl('--hub-soft')).toBe('var(--sw-ink-soft)');
    expect(decl('--hub-link')).toBe('var(--sw-accent)');
    expect(decl('--hub-primary')).toBe('var(--sw-ink)');
    expect(css).toContain('color-mix(in srgb, var(--pg-orange) 12%, var(--hub-surface))');
    expect(css).toContain('color-mix(in srgb, var(--sw-accent) 12%, var(--sw-bg))');
  });

  it('meets WCAG AA for text and for control or chart colors', () => {
    const white = '#FFFFFF';
    const sky = '#E8F4FD';
    const muted = mix(white, sky, 0.42);
    const accentSoft = mix(white, '#FF6B00', 0.12);
    const successBg = mix(white, '#4CAF50', 0.14);
    const warnBg = mix(white, '#FF6B00', 0.12);
    const infoBg = mix(white, '#0066CC', 0.1);
    const topbar = mix(white, sky, 0.86);

    const textPairs: Array<[string, string, string]> = [
      ['ink on sky', '#1A1A2E', sky],
      ['ink on white', '#1A1A2E', white],
      ['soft on sky', '#4A5568', sky],
      ['soft on white', '#4A5568', white],
      ['soft on muted', '#4A5568', muted],
      ['faint on white', decl('--hub-faint'), white],
      ['link on white', '#0066CC', white],
      ['link on sky', '#0066CC', sky],
      ['link hover on white', decl('--hub-link-hover'), white],
      ['accent text on white', decl('--hub-accent-ink'), white],
      ['accent text on sky', decl('--hub-accent-ink'), sky],
      ['accent text on soft', decl('--hub-accent-ink'), accentSoft],
      ['accent text on topbar', decl('--hub-accent-ink'), topbar],
      ['white on accent fill', white, decl('--hub-accent-fill')],
      ['white on accent hover', white, decl('--hub-accent-fill-hover')],
      ['white on primary', white, '#1A1A2E'],
      ['white on primary hover', white, decl('--hub-primary-hover')],
      ['white on navy', white, '#0B2233'],
      ['on navy caption', decl('--hub-on-navy'), '#0B2233'],
      ['success text', decl('--hub-success-ink'), successBg],
      ['success text on white', decl('--hub-success-ink'), white],
      ['warn text', decl('--hub-warn-ink'), warnBg],
      ['info text', decl('--hub-info-ink'), infoBg],
      ['error text', decl('--hub-error-ink'), decl('--hub-error-bg')],
      ['danger text', decl('--hub-danger'), white],
      ['danger ink', decl('--hub-danger-ink'), decl('--hub-danger-soft')],
      ['white on danger fill', white, decl('--hub-danger-fill')],
      ['white on danger hover', white, decl('--hub-danger-fill-hover')],
    ];

    for (const [name, fg, bg] of textPairs) {
      expect(contrast(fg, bg), name).toBeGreaterThanOrEqual(4.5);
    }

    const controlPairs: Array<[string, string, string]> = [
      ['control border on white', decl('--hub-control'), white],
      ['focus on white', decl('--hub-accent-ink'), white],
      ['focus on sky', decl('--hub-accent-ink'), sky],
      ['chart on white', decl('--hub-chart'), white],
      ['chart top on white', decl('--hub-chart-top'), white],
      ['chart on muted', decl('--hub-chart'), muted],
      ['chart top on muted', decl('--hub-chart-top'), muted],
      ['accent line on white', decl('--hub-accent-line'), white],
      ['accent line on soft', decl('--hub-accent-line'), accentSoft],
      ['success line on white', decl('--hub-success-line'), white],
      ['success line on success', decl('--hub-success-line'), successBg],
      ['warn line on warn', decl('--hub-warn-line'), warnBg],
      ['info line on white', decl('--hub-info-line'), white],
      ['info line on info', decl('--hub-info-line'), infoBg],
      ['error line on error', decl('--hub-error-line'), decl('--hub-error-bg')],
      ['danger line on danger soft', decl('--hub-danger-line'), decl('--hub-danger-soft')],
    ];

    for (const [name, fg, bg] of controlPairs) {
      expect(contrast(fg, bg), name).toBeGreaterThanOrEqual(3);
    }
  });
});
