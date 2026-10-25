# Pipeline State

- **Project:** Horace Lawrence / Sunrun rep page (scroll-stop)
- **Mode:** build-only (switched from full on 2026-10-25)
- **Client URL:** https://sunrun.my.salesforce-sites.com/purl/?srep=/powergenie (rep page) · brand: https://www.sunrun.com
- **Niche:** residential solar + home battery, sold through an individual Sunrun sales rep (Bay Area, 510 number)
- **Scroll subject:** storm outage → sun → lit dusk on one house (research/source/storm-to-sunset-raw.mp4)
- **Subject type:** service (before/after, full-bleed — not on white, by user choice)
- **Scraping:** webfetch-fallback (Firecrawl not connected; competitors found by web search)
- **Last updated:** 2026-10-25

## Stage status
| # | Stage | Status | Output |
|---|---|---|---|
| 0 | Intake | done | this file |
| 1 | Brand | skipped (build-only) | — |
| 2 | Competitors | skipped | — |
| 3 | Report | skipped | — |
| 4 | Brief | done (short form) | research/03-build-brief.md |
| — | **Gate 1** | n/a in build-only | — |
| 5 | Prompts | skipped (video in hand) | — |
| — | **Gate 2** | no-op (video in hand) | — |
| 6 | Build | done | site/ |
| 7 | Audit | done (2 placeholders open, not deployed) | research/04-quality-audit.md |

## Design tokens
- **Accent:** #FFB81C sun gold (light #FFD36B) — Sunrun blue #0031FF fails contrast on navy
- **Background:** #050B1A
- **Text primary / muted:** #F4F6FB / #A9B3C7
- **Heading font:** Space Grotesk (self-hosted)
- **Body font:** Inter (self-hosted)
- **Mono font:** JetBrains Mono (self-hosted)
- **Landing pattern:** hero → scroll-scrubbed story (4 snap cards) → specs → features → CTA
- **Visual style:** dark glass, starscape, gradient orbs
- **Motion tier:** canvas scrub + 450ms snap-stop + count-up; reduced motion → static final frame

## Opted-in sections
- Testimonials: no
- Confetti on CTA: yes
- Card scanner (Three.js): no

## Open questions
- The existing concept (index.html, Three.js hero) and the new scroll-stop site (site/) are separate builds. Decide at Gate 1 whether site/ replaces the concept or stays a second variant.
- No headshot of Horace exists yet; the avatar is initials.

## Decisions log
- 2026-10-25 Switched to build-only from storm-to-sunset-raw.mp4; full-bleed cover-fit accepted instead of a white first frame. Frames 120 @ 1280px (1920 was 580KB/frame).
- 2026-10-25 Fonts self-hosted after bisect showed Google Fonts CSS cost ~1s mobile FCP.
- 2026-10-06 Full pipeline chosen over skip-research and prompts-only.
- 2026-10-06 Scroll subject: exploding solar home, chosen over a single-panel teardown and a blackout before/after (before/after can't start on a white frame).
- 2026-10-06 Opt-ins: confetti on CTA only. Testimonials off (no real quotes available), card scanner off (too heavy for a lead page).
