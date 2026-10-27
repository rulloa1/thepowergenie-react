import { metersPerPixel, projectToImage, type ProposalSnapshot } from '../../shared/workflow.js'

/**
 * The proposal page. One self-contained HTML document with no scripts, so
 * the dashboard can preview it in a sandbox and the customer can print it.
 */

export type ProposalView = {
  mode: 'customer' | 'preview'
  imageUrl: string | null
  interestedAction: string | null
  interestedAt: string | null
  thanks?: boolean
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function dollars(value: number, cents = false): string {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`
}

function kwh(value: number): string {
  return `${Math.round(value).toLocaleString('en-US')} kWh`
}

function dateLabel(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })
}

const USAGE_FOR_CUSTOMER: Record<string, string> = {
  override: 'the usage your consultant confirmed with you',
  smart_meter: 'your Smart Meter Texas history',
  bill_history: 'the 12-month usage history on your bill',
  bill_average: 'the average monthly use on your bill',
  bill_period: 'one billing period on your bill',
  bill_amount: 'your bill amount',
  bill_range: 'the monthly bill range you gave us',
}

function usagePhrase(snapshot: ProposalSnapshot): string {
  return USAGE_FOR_CUSTOMER[snapshot.usage.source] || 'your electricity use'
}

function roofSvg(snapshot: ProposalSnapshot): string {
  const roof = snapshot.roof
  if (roof.status !== 'ok' || !roof.center || !roof.zoom || !roof.panelWidthM || !roof.panelHeightM) return ''
  const mpp = metersPerPixel(roof.center.lat, roof.zoom)
  const rects = roof.panels.map(panel => {
    const point = projectToImage(panel, roof.center!, roof.zoom!)
    const long = roof.panelHeightM! / mpp
    const short = roof.panelWidthM! / mpp
    const width = panel.orientation === 'PORTRAIT' ? short : long
    const height = panel.orientation === 'PORTRAIT' ? long : short
    return `<rect x="${(-width / 2).toFixed(2)}" y="${(-height / 2).toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" transform="translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${panel.azimuth})" />`
  })
  return `<svg class="panels" viewBox="0 0 640 640" aria-hidden="true">${rects.join('')}</svg>`
}

function costChart(snapshot: ProposalSnapshot): string {
  const rows = snapshot.schedule
  if (rows.length < 2) return ''
  const width = 640
  const height = 260
  const left = 78
  const right = 16
  const top = 16
  const bottom = 44
  const max = Math.max(...rows.map(row => Math.max(row.billWithout, row.billWith + row.planCost))) * 1.08
  const x = (index: number) => left + (index / (rows.length - 1)) * (width - left - right)
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom)
  const line = (values: number[]) => values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(' ')
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(fraction => {
    const value = max * fraction
    return `<line x1="${left}" x2="${width - right}" y1="${y(value).toFixed(1)}" y2="${y(value).toFixed(1)}" class="grid"/><text x="${left - 10}" y="${(y(value) + 7).toFixed(1)}" text-anchor="end">${esc(dollars(Math.round(value / 100) * 100))}</text>`
  })
  const years = [1, 5, 10, 15, 20, 25].filter(year => year <= rows.length).map(year => `<text x="${x(year - 1).toFixed(1)}" y="${height - 12}" text-anchor="middle">${year === 1 ? 'Yr 1' : year}</text>`)
  const without = rows.map(row => row.billWithout)
  const withSolar = rows.map(row => row.billWith + row.planCost)
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Yearly electricity cost with and without solar over ${rows.length} years">
${ticks.join('')}${years.join('')}
<path d="${line(without)}" class="line-without"/>
<path d="${line(withSolar)}" class="line-with"/>
</svg>
<p class="legend"><span class="key key-without"></span>Without solar <span class="key key-with"></span>With solar (bill + plan)</p>`
}

const STYLE = `
:root{--ink:#1A1A2E;--soft:#4A5568;--line:#E2E8F0;--bg:#F6F7FB;--navy:#0B2233;--accent:#FF6B00;--accent-ink:#B44A00;--good:#1E7A4C}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:24px 16px 48px}
header.top{background:var(--navy);color:#fff;border-radius:20px;padding:24px;box-shadow:inset 0 -4px 0 var(--accent)}
.brand{font-weight:800;letter-spacing:.02em;font-size:.95rem;color:#FFD2B0;margin:0}
h1{margin:6px 0 4px;font-size:clamp(1.6rem,4.5vw,2.3rem);line-height:1.15}
.meta{margin:0;color:#D9E6F2;font-size:.95rem}
.banner{margin:16px 0 0;border-radius:14px;padding:12px 14px;font-size:.92rem}
.banner.prelim{background:#FFF4E8;color:#7A3E00;border:1px solid #F5C894}
.banner.draft{background:#EEF2FF;color:#1E3A8A;border:1px solid #C7D2FE}
.banner.done{background:#ECFDF3;color:#14532D;border:1px solid #A7E3C0}
section{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px;margin-top:16px}
h2{margin:0 0 12px;font-size:1.15rem}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:10px}
.stat{border:1px solid var(--line);border-radius:14px;padding:14px}
.stat b{display:block;font-size:clamp(1.25rem,5vw,1.6rem);line-height:1.1;font-variant-numeric:tabular-nums}
.stat span{color:var(--soft);font-size:.86rem}
.stat.hero b{color:var(--good)}
.roof{position:relative;border-radius:14px;overflow:hidden;background:#0B2233;aspect-ratio:1/1;max-width:520px;margin:0 auto}
.roof img{display:block;width:100%;height:100%;object-fit:cover}
.roof .panels{position:absolute;inset:0;width:100%;height:100%}
.roof .panels rect{fill:rgba(20,40,90,.82);stroke:#9CC3FF;stroke-width:.8}
.caption{color:var(--soft);font-size:.8rem;margin:8px 0 0;text-align:center}
.compare{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}
.box{border:1px solid var(--line);border-radius:14px;padding:14px}
.box p{margin:4px 0;display:flex;justify-content:space-between;gap:12px;font-variant-numeric:tabular-nums}
.box p.total{border-top:1px solid var(--line);margin-top:8px;padding-top:8px;font-weight:700}
.chart{width:100%;height:auto;font-size:20px;fill:var(--soft)}
.chart .grid{stroke:#EDF1F6;stroke-width:1}
.chart .line-without{fill:none;stroke:#9AA6B4;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
.chart .line-with{fill:none;stroke:var(--accent);stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
.legend{margin:6px 0 0;color:var(--soft);font-size:.85rem;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}
.key{display:inline-block;width:18px;height:4px;border-radius:2px;margin-right:6px;vertical-align:middle}
.key-without{background:#9AA6B4}.key-with{background:var(--accent)}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.92rem;font-variant-numeric:tabular-nums}
th,td{padding:8px 6px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:left}
th{font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:var(--soft)}
ul.assume{margin:0;padding-left:1.1em;color:var(--soft);font-size:.92rem}
ul.assume li{margin:4px 0}
.cta{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:999px;font-weight:700;font-size:1rem;text-decoration:none;border:0;cursor:pointer}
.btn.primary{background:var(--accent);color:#fff}
.btn.ghost{background:#fff;color:var(--ink);border:1.5px solid #CBD5E1}
.fine{color:var(--soft);font-size:.82rem;margin-top:16px}
@media print{body{background:#fff}.cta{display:none}section,header.top{break-inside:avoid}}
`

export function renderProposalHtml(snapshot: ProposalSnapshot, view: ProposalView): string {
  const s = snapshot
  const m = s.money
  const battery = s.system.battery
  const fiveYear = s.schedule.filter(row => row.year === 1 || row.year % 5 === 0)
  const offsetLine = s.system.limitedByRoof
    ? `The roof fits ${s.system.panels} panels, which covers about ${s.system.offsetPct}% of the home's yearly use.`
    : `Sized to cover about ${s.system.offsetPct}% of the home's yearly use.`
  const roofBlock = view.imageUrl && s.roof.status === 'ok'
    ? `<div class="roof"><img src="${esc(view.imageUrl)}" alt="Satellite view of the roof with the proposed solar panels drawn on it"/>${roofSvg(s)}</div>
<p class="caption">Proposed panel layout${s.roof.imageryDate ? ` · Imagery ${esc(s.roof.imageryDate)}` : ''} · Imagery ©Google. The final layout is confirmed at the site survey.</p>`
    : `<p class="caption" style="text-align:left">The exact panel layout is confirmed at the site survey.</p>`
  const banners: string[] = []
  if (view.mode === 'preview') {
    banners.push('<p class="banner draft">Draft preview. The customer cannot see this until it is approved.</p>')
  }
  if (s.preliminary) {
    banners.push(`<p class="banner prelim">Preliminary estimate based on ${esc(usagePhrase(s))}. Send a recent electric bill and we will update it with your exact numbers.</p>`)
  }
  if (view.thanks || view.interestedAt) {
    banners.push(`<p class="banner done">Thanks! ${esc(s.advisor.name)} has your request and will call you soon.</p>`)
  }
  const interested = view.mode === 'customer' && view.interestedAction && !view.interestedAt && !view.thanks
    ? `<form method="post" action="${esc(view.interestedAction)}" style="margin:0"><button class="btn primary" type="submit">I'm interested. Have ${esc(s.advisor.name.split(' ')[0])} call me</button></form>`
    : ''
  const phoneDigits = s.advisor.phone.replace(/[^\d+]/g, '')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Solar proposal for ${esc(s.customer.name)} · The Power Genie</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header class="top">
<p class="brand">THE POWER GENIE · SUNRUN SOLAR</p>
<h1>Solar proposal for ${esc(s.customer.name)}</h1>
<p class="meta">${s.customer.address ? `${esc(s.customer.address)} · ` : ''}Prepared by ${esc(s.advisor.name)} · ${esc(dateLabel(s.preparedAt))}</p>
</header>
${banners.join('\n')}
<section>
<h2>At a glance</h2>
<div class="stats">
<div class="stat hero"><b>${esc(dollars(m.savingsMonthly))}</b><span>Estimated savings per month, year 1</span></div>
<div class="stat hero"><b>${esc(dollars(m.savingsTotal))}</b><span>Estimated savings over ${s.schedule.length} years</span></div>
<div class="stat"><b>${esc(s.system.kw)} kW</b><span>${s.system.panels} panels${battery ? ` + ${esc(battery)}` : ''}</span></div>
<div class="stat"><b>${s.system.offsetPct}%</b><span>Of your yearly electricity</span></div>
</div>
</section>
<section>
<h2>Your system</h2>
${roofBlock}
<div class="stats" style="margin-top:14px">
<div class="stat"><b>${s.system.panels}</b><span>Panels, ${s.system.panelWatts} W each</span></div>
<div class="stat"><b>${esc(kwh(s.system.productionKwh))}</b><span>Made in year 1</span></div>
<div class="stat"><b>${esc(kwh(s.usage.annualKwh))}</b><span>Your home uses per year</span></div>
${battery ? `<div class="stat"><b>Backup</b><span>${esc(battery)} keeps the lights and AC on in an outage</span></div>` : ''}
</div>
<p class="fine" style="margin-top:12px">${esc(offsetLine)}</p>
</section>
<section>
<h2>Your monthly cost, year 1</h2>
<div class="compare">
<div class="box"><p><span>Electric bill today</span><span>${esc(dollars(m.billNowMonthly))}</span></p><p class="total"><span>Total</span><span>${esc(dollars(m.billNowMonthly))}</span></p></div>
<div class="box"><p><span>Electric bill with solar</span><span>${esc(dollars(m.billWithSolarMonthly))}</span></p><p><span>${esc(s.plan.name)}</span><span>${esc(dollars(m.planMonthly))}</span></p><p class="total"><span>Total</span><span>${esc(dollars(m.billWithSolarMonthly + m.planMonthly))}</span></p></div>
</div>
<p class="fine">Estimated savings: <b>${esc(dollars(m.savingsMonthly))}</b> a month in year 1.</p>
</section>
<section>
<h2>Over ${s.schedule.length} years</h2>
${costChart(s)}
<div class="table-wrap" style="margin-top:12px">
<table>
<thead><tr><th>Year</th><th>Without solar</th><th>With solar</th><th>You save</th></tr></thead>
<tbody>
${fiveYear.map(row => `<tr><td>${row.year}</td><td>${esc(dollars(row.billWithout))}</td><td>${esc(dollars(row.billWith + row.planCost))}</td><td>${esc(dollars(row.savings))}</td></tr>`).join('\n')}
</tbody>
</table>
</div>
</section>
<section>
<h2>How we estimated this</h2>
<ul class="assume">
<li>Your usage: ${esc(kwh(s.usage.annualKwh))} a year, from ${esc(usagePhrase(s))}.</li>
<li>Utility rate: ${s.utility.rateCents}¢ per kWh${s.utility.fromBill ? ' from your bill' : ' (typical for the Houston area)'}, rising ${s.utility.escalatorPct}% a year.</li>
<li>${esc(s.plan.name)}: ${s.plan.rateCents}¢ per kWh the panels make${s.plan.escalatorPct ? `, rising ${s.plan.escalatorPct}% a year` : ', fixed'}, for ${s.plan.termYears} years.</li>
<li>Power sent back to the grid earns about ${s.utility.exportCreditCents}¢ per kWh, depending on your electricity plan.</li>
<li>Panel output declines slightly each year, as all panels do.</li>
</ul>
<p class="fine">This is an estimate, not a contract. Final pricing, terms and any incentives come from your Sunrun agreement. Actual savings depend on your usage, your electricity plan, utility rates and weather.</p>
</section>
<section>
<h2>Next step</h2>
<div class="cta">
${interested}
<a class="btn ghost" href="tel:${esc(phoneDigits)}">Call ${esc(s.advisor.name.split(' ')[0])} · ${esc(s.advisor.phone)}</a>
</div>
<p class="fine">${esc(s.advisor.name)}, Sunrun solar consultant · ${esc(s.advisor.email)}</p>
</section>
</div>
</body>
</html>`
}

export function renderMessagePage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${esc(title)}</title><style>${STYLE}</style></head><body><div class="wrap"><header class="top"><p class="brand">THE POWER GENIE</p><h1>${esc(title)}</h1></header><section><p style="margin:0">${esc(body)}</p></section></div></body></html>`
}
