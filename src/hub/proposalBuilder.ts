import {
  DEFAULT_PRICING,
  projectSavings,
  type PricingSettings,
  type ProposalSnapshot,
  type ScheduleRow,
  type SystemSize,
  type UsageEstimate,
} from '../../shared/workflow';

export interface ProposalInputParams {
  leadId?: string;
  customerName: string;
  address?: string;
  email?: string;
  phone?: string;
  panelCount: number;
  panelWatts?: number;
  annualConsumptionKwh?: number;
  ppaRateCents: number;
  ppaEscalatorPct: number;
  utilityRateCents?: number;
  includeBattery: boolean;
  batteryName?: string;
  termYears?: number;
}

export interface BuiltProposal {
  snapshot: ProposalSnapshot;
  system: SystemSize & { panelWatts: number; battery: string | null };
  monthlyBillNow: number;
  monthlySolarPlan: number;
  monthlyRemainingUtility: number;
  monthlySavings: number;
  firstYearSavings: number;
  twentyFiveYearSavings: number;
  twentyFiveYearCostWithout: number;
  twentyFiveYearCostWith: number;
  schedule: ScheduleRow[];
  html: string;
}

const DEFAULT_ANNUAL_CONSUMPTION_KWH = 13500;
const KWH_PER_KW_YEAR = 1420;
const DEFAULT_PANEL_WATTS = 400;

export function buildProposal(params: ProposalInputParams): BuiltProposal {
  const panelWatts = params.panelWatts ?? DEFAULT_PANEL_WATTS;
  const panelCount = Math.max(1, params.panelCount);
  const dcKw = Number(((panelCount * panelWatts) / 1000).toFixed(1));
  const productionKwh = Math.round(dcKw * KWH_PER_KW_YEAR);
  const annualConsumption = params.annualConsumptionKwh && params.annualConsumptionKwh > 0
    ? params.annualConsumptionKwh
    : DEFAULT_ANNUAL_CONSUMPTION_KWH;
  const offsetPct = Math.min(150, Math.round((productionKwh / annualConsumption) * 100));

  const pricing: PricingSettings = {
    ...DEFAULT_PRICING,
    ppaRateCents: params.ppaRateCents,
    ppaEscalatorPct: params.ppaEscalatorPct,
    termYears: params.termYears ?? 25,
    includeBattery: params.includeBattery,
    batteryName: params.batteryName ?? 'Tesla Powerwall 3',
    utilityRateCents: params.utilityRateCents ?? DEFAULT_PRICING.utilityRateCents,
  };

  const savings = projectSavings({
    annualKwh: annualConsumption,
    productionKwh,
    utilityRateCents: pricing.utilityRateCents,
    pricing,
  });

  const usage: UsageEstimate = {
    annualKwh: annualConsumption,
    source: 'bill_history',
    label: '12-month bill history',
    confident: true,
  };

  const system = {
    panels: panelCount,
    kw: dcKw,
    productionKwh,
    offsetPct,
    limitedByRoof: false,
    method: 'usage' as const,
    panelWatts,
    battery: params.includeBattery ? pricing.batteryName : null,
  };

  const nameParts = params.customerName.trim().split(/\s+/);
  const firstName = nameParts[0] || 'Homeowner';

  const snapshot: ProposalSnapshot = {
    version: 1,
    inputsHash: `prop-${Date.now()}-${panelCount}`,
    preparedAt: new Date().toISOString(),
    customer: {
      name: params.customerName,
      firstName,
      address: params.address || null,
    },
    advisor: {
      name: pricing.advisorName,
      phone: pricing.advisorPhone,
      email: pricing.advisorEmail,
    },
    plan: {
      name: pricing.planName,
      rateCents: pricing.ppaRateCents ?? 0,
      escalatorPct: pricing.ppaEscalatorPct ?? 0,
      termYears: pricing.termYears,
    },
    usage,
    utility: {
      rateCents: pricing.utilityRateCents,
      fromBill: true,
      escalatorPct: pricing.utilityEscalatorPct,
      exportCreditCents: pricing.exportCreditCents,
    },
    system,
    money: {
      billNowMonthly: savings.billNowMonthly,
      billWithSolarMonthly: savings.billWithSolarMonthly,
      planMonthly: savings.planMonthly,
      savingsMonthly: savings.savingsMonthly,
      savingsYear1: savings.savingsYear1,
      savingsTotal: savings.savingsTotal,
      costWithoutTotal: savings.costWithoutTotal,
      costWithTotal: savings.costWithTotal,
    },
    schedule: savings.schedule,
    roof: {
      status: 'none',
      center: null,
      zoom: null,
      panelWidthM: null,
      panelHeightM: null,
      panels: [],
      imageryDate: null,
    },
    preliminary: false,
  };

  const html = generateProposalHtml(snapshot);

  return {
    snapshot,
    system,
    monthlyBillNow: savings.billNowMonthly,
    monthlySolarPlan: savings.planMonthly,
    monthlyRemainingUtility: savings.billWithSolarMonthly,
    monthlySavings: savings.savingsMonthly,
    firstYearSavings: savings.savingsYear1,
    twentyFiveYearSavings: savings.savingsTotal,
    twentyFiveYearCostWithout: savings.costWithoutTotal,
    twentyFiveYearCostWith: savings.costWithTotal,
    schedule: savings.schedule,
    html,
  };
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dollars(value: number, cents = false): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
}

export function generateProposalHtml(s: ProposalSnapshot): string {
  const m = s.money;
  const battery = s.system.battery;
  const fiveYear = s.schedule.filter((row) => row.year === 1 || row.year % 5 === 0);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Solar Proposal for ${esc(s.customer.name)} · The Power Genie</title>
<style>
:root {
  --ink: #1A1A2E;
  --soft: #4A5568;
  --line: #E2E8F0;
  --bg: #F6F7FB;
  --navy: #0B2233;
  --accent: #FF6B00;
  --good: #1E7A4C;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5; padding: 24px 16px 48px; }
.wrap { max-width: 860px; margin: 0 auto; }
header.top { background: var(--navy); color: #fff; border-radius: 20px; padding: 28px; box-shadow: inset 0 -4px 0 var(--accent); }
.brand { font-size: 0.85rem; font-weight: 800; letter-spacing: 0.12em; color: #FF8A2B; text-transform: uppercase; margin-bottom: 6px; }
h1 { font-size: 2.2rem; font-weight: 800; line-height: 1.15; color: #ffffff; }
.meta { margin-top: 8px; color: #D9E6F2; font-size: 0.95rem; }
.badge { display: inline-block; margin-top: 14px; background: rgba(255, 107, 0, 0.2); color: #FFD2B0; border: 1px solid rgba(255, 107, 0, 0.4); border-radius: 999px; padding: 4px 14px; font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
section { background: #fff; border: 1px solid var(--line); border-radius: 18px; padding: 24px; margin-top: 18px; }
h2 { font-size: 1.25rem; font-weight: 800; color: var(--navy); margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.stat { border: 1px solid var(--line); border-radius: 14px; padding: 16px; background: #FAFBFD; }
.stat.hero { background: #F0FDF4; border-color: #BBF7D0; }
.stat b { display: block; font-size: 1.8rem; font-weight: 800; color: var(--ink); line-height: 1.1; }
.stat.hero b { color: var(--good); }
.stat span { display: block; font-size: 0.84rem; color: var(--soft); margin-top: 4px; font-weight: 500; }
.compare { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; margin-top: 12px; }
.box { border: 1px solid var(--line); border-radius: 14px; padding: 18px; background: #ffffff; }
.box h3 { font-size: 1rem; font-weight: 700; color: var(--navy); margin-bottom: 10px; }
.box p { display: flex; justify-content: space-between; font-size: 0.95rem; margin: 6px 0; color: var(--soft); }
.box p b { color: var(--ink); font-weight: 600; }
.box p.total { border-top: 2px solid var(--line); margin-top: 10px; padding-top: 10px; font-weight: 800; color: var(--ink); font-size: 1.05rem; }
.box p.total b { color: var(--good); }
.table-wrap { overflow-x: auto; margin-top: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
th, td { padding: 10px 8px; border-bottom: 1px solid var(--line); text-align: right; }
th:first-child, td:first-child { text-align: left; }
th { font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--soft); font-weight: 700; }
.guarantees { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 12px; }
.guarantee-card { border: 1px solid var(--line); border-radius: 12px; padding: 14px; background: #F8FAFC; }
.guarantee-card b { display: block; color: var(--navy); font-size: 0.95rem; }
.guarantee-card p { font-size: 0.85rem; color: var(--soft); margin-top: 4px; line-height: 1.4; }
.cta-bar { margin-top: 24px; text-align: center; background: #0B2233; color: #fff; border-radius: 16px; padding: 24px; }
.cta-bar p { color: #D9E6F2; font-size: 0.95rem; margin-top: 6px; }
.cta-button { display: inline-block; margin-top: 14px; background: var(--accent); color: #fff; text-decoration: none; font-weight: 800; font-size: 1.05rem; padding: 12px 28px; border-radius: 999px; }
@media print {
  body { background: #fff; padding: 0; }
  .cta-bar { display: none; }
  section, header.top { break-inside: avoid; }
}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <p class="brand">The Power Genie · Sunrun Certified Partner</p>
    <h1>Solar Proposal for ${esc(s.customer.name)}</h1>
    <p class="meta">${s.customer.address ? `${esc(s.customer.address)} · ` : ''}Prepared by ${esc(s.advisor.name)} · ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
    <div class="badge">Zero-Down Guaranteed Solar Savings</div>
  </header>

  <section>
    <h2>Executive Summary</h2>
    <div class="stats">
      <div class="stat hero">
        <b>${esc(dollars(m.savingsMonthly))}</b>
        <span>First Year Monthly Savings</span>
      </div>
      <div class="stat hero">
        <b>${esc(dollars(m.savingsTotal))}</b>
        <span>Estimated 25-Year Cumulative Savings</span>
      </div>
      <div class="stat">
        <b>${esc(s.system.kw)} kW DC</b>
        <span>${s.system.panels} High-Efficiency Panels</span>
      </div>
      <div class="stat">
        <b>${s.system.offsetPct}%</b>
        <span>Home Energy Consumption Offset</span>
      </div>
    </div>
  </section>

  <section>
    <h2>Utility Bill Comparison (First Year)</h2>
    <div class="compare">
      <div class="box">
        <h3>Current Utility (Without Solar)</h3>
        <p>Current Electric Rate: <b>${esc(s.utility.rateCents)}¢ / kWh</b></p>
        <p>Annual Electricity Consumption: <b>${s.usage.annualKwh.toLocaleString()} kWh</b></p>
        <p class="total">Estimated Monthly Bill: <b>${esc(dollars(m.billNowMonthly))} / mo</b></p>
      </div>
      <div class="box">
        <h3>With Sunrun Clean Solar Energy</h3>
        <p>Solar Plan Rate: <b>${esc(s.plan.rateCents)}¢ / kWh</b></p>
        <p>New Solar Monthly Charge: <b>${esc(dollars(m.planMonthly))} / mo</b></p>
        <p>Remaining Utility Service Fee: <b>${esc(dollars(m.billWithSolarMonthly))} / mo</b></p>
        <p class="total">New Combined Monthly: <b>${esc(dollars(m.planMonthly + m.billWithSolarMonthly))} / mo</b></p>
      </div>
    </div>
  </section>

  <section>
    <h2>System Specifications & Hardware</h2>
    <div class="guarantees">
      <div class="guarantee-card">
        <b>Tier-1 Monocrystalline Panels</b>
        <p>${s.system.panels} × ${s.system.panelWatts}W all-black high-durability panels rated for 25+ years.</p>
      </div>
      <div class="guarantee-card">
        <b>${battery ? esc(battery) : 'Smart Solar Inverter System'}</b>
        <p>${battery ? '13.5 kWh LFP capacity with whole-home backup islanding during storm outages.' : 'Next-generation rapid-shutdown smart solar string inverters.'}</p>
      </div>
      <div class="guarantee-card">
        <b>25-Year Comprehensive Warranty</b>
        <p>Includes complete equipment coverage, roof penetration warranty, and active system monitoring.</p>
      </div>
    </div>
  </section>

  <section>
    <h2>25-Year Financial Projection</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Year</th>
            <th>Solar Gen (kWh)</th>
            <th>Cost Without Solar</th>
            <th>Cost With Solar</th>
            <th>Annual Savings</th>
            <th>Cumulative Savings</th>
          </tr>
        </thead>
        <tbody>
          ${fiveYear
            .map(
              (row) => `
            <tr>
              <td>Year ${row.year}</td>
              <td>${row.productionKwh.toLocaleString()}</td>
              <td>${dollars(row.billWithout)}</td>
              <td>${dollars(row.billWith + row.planCost)}</td>
              <td style="color:var(--good);font-weight:600;">+${dollars(row.savings)}</td>
              <td style="color:var(--good);font-weight:700;">+${dollars(row.cumulative)}</td>
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  </section>

  <div class="cta-bar">
    <h2>Ready to lock in your solar rate?</h2>
    <p>Contact your certified Sunrun advisor Horace Lawrence at (510) 241-7007.</p>
    <a href="tel:+15102417007" class="cta-button">Call to Schedule Site Survey</a>
  </div>
</div>
</body>
</html>`;
}
