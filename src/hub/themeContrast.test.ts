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
  return `#${channels.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

describe('referral hub theme tokens', () => {
  it('keeps the React marketing tokens and uses the static site palette on the hub', () => {
    expect(decl('--sw-bg')).toBe('#E8F4FD');
    expect(decl('--sw-ink')).toBe('#1A1A2E');
    expect(decl('--sw-ink-soft')).toBe('#4A5568');
    expect(decl('--sw-accent')).toBe('#0066CC');
    expect(decl('--pg-orange')).toBe('#FF6B00');
    expect(decl('--pg-green')).toBe('#4CAF50');
    expect(decl('--pg-navy')).toBe('#0B2233');
    expect(decl('--pg-logo')).toBe('#071b27');
    expect(decl('--hub-bg')).toBe('#071b27');
    expect(decl('--hub-ink')).toBe('#f7fbff');
    expect(decl('--hub-soft')).toBe('#bed0dc');
    expect(decl('--hub-link')).toBe('#87dbff');
    expect(decl('--hub-primary')).toBe('#d4f1ff');
    expect(decl('--hub-on-primary')).toBe('#082638');
    expect(decl('--hub-accent-fill')).toBe('#ffcf75');
    expect(decl('--hub-on-accent')).toBe('#102029');
    expect(decl('--hub-accent-ink')).toBe('#ffdc90');
    expect(decl('--hub-focus')).toBe('#ffdc90');
    expect(css).toContain('color-mix(in srgb, #ffcf75 16%, var(--hub-surface))');
    expect(css).toContain('color-mix(in srgb, #87dbff 12%, #071b27)');
    expect(css).not.toContain('--hub-bg: var(--sw-bg)');
  });

  it('meets WCAG AA for text and for control or chart colors', () => {
    const bg = decl('--hub-bg');
    const surface = decl('--hub-surface');
    const muted = decl('--hub-muted');
    const topbar = decl('--hub-topbar');
    const accentSoft = mix(surface, '#ffcf75', 0.16);
    const successBg = mix(surface, '#34d399', 0.18);
    const warnBg = mix(surface, '#fbbf24', 0.18);
    const infoBg = mix(surface, '#87dbff', 0.16);
    const errorBg = mix(surface, '#f87171', 0.18);
    const dangerSoft = mix(surface, '#f87171', 0.2);

    const textPairs: Array<[string, string, string]> = [
      ['ink on page', decl('--hub-ink'), bg],
      ['ink on surface', decl('--hub-ink'), surface],
      ['ink on muted', decl('--hub-ink'), muted],
      ['ink on topbar', decl('--hub-ink'), topbar],
      ['soft on page', decl('--hub-soft'), bg],
      ['soft on surface', decl('--hub-soft'), surface],
      ['soft on muted', decl('--hub-soft'), muted],
      ['faint on surface', decl('--hub-faint'), surface],
      ['link on page', decl('--hub-link'), bg],
      ['link on surface', decl('--hub-link'), surface],
      ['link hover on surface', decl('--hub-link-hover'), surface],
      ['gold label on page', decl('--hub-accent-ink'), bg],
      ['gold label on surface', decl('--hub-accent-ink'), surface],
      ['gold label on soft', decl('--hub-accent-ink'), accentSoft],
      ['gold label on topbar', decl('--hub-accent-ink'), topbar],
      ['primary text', decl('--hub-on-primary'), decl('--hub-primary')],
      ['primary hover text', decl('--hub-on-primary'), decl('--hub-primary-hover')],
      ['accent text', decl('--hub-on-accent'), decl('--hub-accent-fill')],
      ['accent hover text', decl('--hub-on-accent'), decl('--hub-accent-fill-hover')],
      ['on navy caption', decl('--hub-on-navy'), '#0B2233'],
      ['success text', decl('--hub-success-ink'), successBg],
      ['warn text', decl('--hub-warn-ink'), warnBg],
      ['info text', decl('--hub-info-ink'), infoBg],
      ['error text', decl('--hub-error-ink'), errorBg],
      ['danger text on surface', decl('--hub-danger'), surface],
      ['danger ink on soft', decl('--hub-danger-ink'), dangerSoft],
      ['white on danger fill', '#ffffff', decl('--hub-danger-fill')],
      ['white on danger hover', '#ffffff', decl('--hub-danger-fill-hover')],
    ];

    for (const [name, fg, background] of textPairs) {
      expect(contrast(fg, background), name).toBeGreaterThanOrEqual(4.5);
    }

    const controlPairs: Array<[string, string, string]> = [
      ['control border on surface', decl('--hub-control'), surface],
      ['control border on page', decl('--hub-control'), bg],
      ['focus on page', decl('--hub-focus'), bg],
      ['focus on surface', decl('--hub-focus'), surface],
      ['chart on surface', decl('--hub-chart'), surface],
      ['chart top on surface', decl('--hub-chart-top'), surface],
      ['chart on muted', decl('--hub-chart'), muted],
      ['chart top on muted', decl('--hub-chart-top'), muted],
      ['accent line on surface', decl('--hub-accent-line'), surface],
      ['accent line on soft', decl('--hub-accent-line'), accentSoft],
      ['success line on success', decl('--hub-success-line'), successBg],
      ['warn line on warn', decl('--hub-warn-line'), warnBg],
      ['info line on info', decl('--hub-info-line'), infoBg],
      ['error line on error', decl('--hub-error-line'), errorBg],
      ['danger line on danger soft', decl('--hub-danger-line'), dangerSoft],
      ['danger line on surface', decl('--hub-danger-line'), surface],
    ];

    for (const [name, fg, background] of controlPairs) {
      expect(contrast(fg, background), name).toBeGreaterThanOrEqual(3);
    }
  });
});
