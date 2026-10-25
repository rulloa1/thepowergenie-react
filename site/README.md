# The Power Genie — scroll-stop page

Static site: a storm-outage house scrubs to a lit, solar-powered dusk as you scroll.
No build step. Frames: `frames/frame_0001–0120.jpg` (1280px, 12fps from
`research/source/storm-to-sunset-raw.mp4`, all under 100KB).

## Run locally
Frames can't load from `file://` — serve over HTTP:

    cd site && python -m http.server 8080   # then open http://localhost:8080

## Before launch (placeholders)
- Replace `https://SITE_URL` in `index.html` (canonical, OG, JSON-LD), `robots.txt`, `sitemap.xml`.
- Confirm the "25 yr service agreement" spec with Horace.
- CTA goes to Horace's Sunrun referral page (`srep=/powergenie`); the phone is 510-241-7007. No form endpoint on this page.

## Deploy
**Vercel:** `cd site && npx vercel` (preview) then `npx vercel --prod`. `vercel.json` sets long cache on frames.
**Netlify:** `npx netlify deploy --dir site` then add `--prod`. `404.html` is picked up automatically on both.

## Re-extracting frames

    ffmpeg -i research/source/storm-to-sunset-raw.mp4 -vf "fps=12,hqdn3d=4:3:6:4,scale=1280:-2" -q:v 9 site/frames/frame_%04d.jpg

If you change the count, update `FRAME_COUNT` in `js/main.js`.
