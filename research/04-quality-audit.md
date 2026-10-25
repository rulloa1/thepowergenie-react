# Quality Audit — site/ (2026-10-25)

Lighthouse 12.6.0 against `python -m http.server` on localhost (no gzip, so byte-weight audits overstate).

| Run | Perf | A11y | Best practices | SEO | FCP | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| Desktop | 100 | 100 | 100 | 100 | 0.4s | 0.5s | 0.006 | 0ms |
| Mobile (slow 4G, 4× CPU) | 92 | 100 | 100 | 100 | 1.6s | 2.0s | 0.023 | 300ms |

## Fixed during the audit
| Failure | Cause | Fix |
|---|---|---|
| Mobile perf 84, FCP 2.8s | Google Fonts CSS (`media=print` swap) chained 3 cross-origin woff2 fetches ahead of first text paint — found by bisecting (no-fonts variant scored 99) | Self-hosted latin variable subsets in `assets/fonts/`, preload Space Grotesk + Inter |
| Frames competing with hero | 8.6MB preload started at ~370ms | Preload starts after `document.fonts.ready` + idle, or when the visitor is within 1.5 viewports of the section |
| Full-page loader hid the hero | Loader was `position: fixed` over everything | Loader now covers only the sticky scroll section; canvas still reveals only after all 120 frames |
| Starscape ahead of first paint | Full-viewport canvas at 2.6× DPR redrawn every frame from script start | Starts after `load` + idle, DPR capped at 2, 90 stars on phones |
| 15px canvas clip on right | Canvas sized to `innerWidth`, which includes the reserved scrollbar gutter | Sized to `documentElement.clientWidth` |
| Paint cost | `filter: blur(80px)` orbs, `backdrop-filter` on 10 layers | Radial-gradient orbs; blur only on visible annotation cards and the scrolled nav |
| Copy mismatch | Card 03 said battery "on the wall"; the clip shows it beside the house | Copy + canvas aria-label + alt text corrected |
| Logo read as a person icon at 28px | Circle-over-chevron mark | Sun-on-horizon mark (nav, loader, footer, favicon) |

## SEO
- [x] Unique title + meta description · one H1 · H2 per section, H3 per card/feature
- [x] Alt text on the static frame; canvas has `role="img"` + full aria-label describing the sequence
- [x] JSON-LD `ProfessionalService` with Horace as `employee` · OG + Twitter tags · `sitemap.xml` · `robots.txt`
- [ ] **PLACEHOLDER** `https://SITE_URL` in canonical, OG, JSON-LD, robots, sitemap — no production domain yet

## Accessibility
- [x] Contrast: text #F4F6FB / muted #A9B3C7 on #050B1A (≥ 8.9:1); black on #FFB81C (11:1); cards over frames sit on 62%-opaque navy
- [x] Skip link, visible `:focus-visible` ring, all actions are real links (keyboard reachable)
- [x] `prefers-reduced-motion`: canvas hidden, static final frame shown, 4 cards rendered as a grid, no snap-stop, no count-up, no confetti, static stars — verified in browser
- [x] Text equivalent of the animation: canvas aria-label + the four cards are in the DOM
- [x] External CTA announces "opens in a new tab"

## Performance
- [x] 120 frames, 1280px, max 98KB, median 70KB, 8.6MB total
- [x] rAF-batched scroll handler, `{ passive: true }`, frame dedup, DPR-scaled canvas, no `scroll-behavior: smooth`
- [x] Snap-stop holds via `html.snap-hold` + `scrollbar-gutter: stable` — no layout shift when scroll locks
- [x] `vercel.json` sets 1-year immutable cache on `/frames/*` (fixes the cache-TTL audit once deployed)
- [ ] Mobile TBT 300ms comes from frame decode after idle; acceptable at 92, revisit if more sections are added

## Client-ready
- [x] Favicon (SVG) · OG image 1200×630 from the final frame · `404.html` · `site/README.md` with Vercel + Netlify steps
- [x] Form endpoints: none — CTA goes to Horace's Sunrun referral page (`srep=/powergenie`), phone 510-241-7007
- [ ] **PLACEHOLDER** confirm "25 yr service agreement" with Horace
- [ ] Not deployed to a preview URL — publishing a page with Horace's name and number is outward-facing; waiting on go-ahead
