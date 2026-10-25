# Build Brief — short form (build-only mode)

**Project:** The Power Genie · Horace Lawrence, Sunrun solar advisor — scroll-stop page
**Date:** 2026-10-25 · **Mode:** build-only (Stages 1–3 skipped; no competitor data behind these choices)

## The asset
`research/source/storm-to-sunset-raw.mp4` — 10s, 1920×1080. One house, locked camera:
storm-dark grid outage (0–3s) → sun breaks, panels catch light (3–5s) → golden hour, wall battery
visible (5–8s) → dusk, every window lit (8–10s). Full-bleed scene, not on white — the user chose
cover-fit full-bleed over a re-render (2026-10-25), so nothing composites against the page.

Frames: 120 @ 12fps, 1280px wide, `hqdn3d` light denoise, JPEG q9. Median 70KB, max 98KB.
1920px was 580KB/frame (AI film grain) — 1280 is the size the 100KB budget allows.

## Story beats → annotation cards
| # | Progress | Frames | Card |
|---|---|---|---|
| 01 | 0.06–0.24 | 8–29 | The grid goes dark — storm, outage |
| 02 | 0.33–0.49 | 40–59 | Panels take the sun |
| 03 | 0.56–0.70 | 67–84 | The battery banks the surplus |
| 04 | 0.80–0.96 | 96–115 | The lights stay on |

## Design tokens
- **Background** `#050B1A` — the rep page's navy `#05193D` pushed toward black so the storm frames
  sit in it without a seam.
- **Accent** `#FFB81C` sun gold, light `#FFD36B`. It is the color of the clip's payoff (lit windows),
  and black text on it clears 11:1. Sunrun blue `#0031FF` fails contrast on navy (2.0:1), so it is not
  used for text.
- **Text** `#F4F6FB` primary, `#A9B3C7` muted (8.9:1 on bg).
- **Fonts** Space Grotesk (display) · Inter (body — already the Power Genie app font) · JetBrains Mono
  (numbers, card indices).
- **Motion tier** scroll-scrubbed canvas + snap-stop (450ms hold) + count-up. Reduced motion → static
  final frame, cards rendered as a list, no snap.

## Copy sources
All copy restates claims already in the Power Genie app (`src/App.tsx`, `src/components/ScrollWorld.tsx`)
or public Tesla Powerwall 3 specs. Phone 510-241-7007 and the referral URL are Horace's, from `src/App.tsx`.

## Placeholders to resolve before launch
- `SITE_URL` in `<head>` canonical / OG tags and `sitemap.xml` — no production domain chosen.
- "25-year agreement" spec — Sunrun lease/PPA term; confirm with Horace that it applies to the plans
  he quotes.
