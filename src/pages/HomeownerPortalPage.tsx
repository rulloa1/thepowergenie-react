import React, { useState, useEffect } from 'react';
import {
  Shield,
  Zap,
  Battery,
  Users,
  DollarSign,
  TrendingUp,
  Share2,
  Copy,
  Check,
  QrCode,
  Phone,
  Mail,
  Calendar,
  AlertTriangle,
  Award,
  ChevronRight,
  Sun,
  Home as HomeIcon,
  Activity,
  ArrowRight,
  CheckCircle2
} from 'lucide-react';
import { BrandMark, Button } from '../hub/ui';

interface ReferralRecord {
  id: string;
  name: string;
  location: string;
  system: string;
  date: string;
  status: 'paid' | 'pending' | 'review';
  statusLabel: string;
  reward: number;
  payoutMethod: string;
}

const INITIAL_REFERRALS: ReferralRecord[] = [
  {
    id: 'REF-1092',
    name: 'Marcus Sterling',
    location: 'Oakland Hills, CA',
    system: 'Solar (9.2 kW) + Tesla Powerwall 3',
    date: 'Oct 12, 2026',
    status: 'paid',
    statusLabel: 'Installed & Verified ($1,000 Paid)',
    reward: 1000,
    payoutMethod: 'Zelle Payout Sent',
  },
  {
    id: 'REF-1093',
    name: 'Elena Rostova',
    location: 'Berkeley, CA',
    system: 'Solar (11.4 kW) + Tesla Powerwall 3',
    date: 'Oct 18, 2026',
    status: 'pending',
    statusLabel: 'Permits Approved (Install Next Week)',
    reward: 1000,
    payoutMethod: 'ACH Direct Deposit Pending',
  },
  {
    id: 'REF-1094',
    name: 'Devon Washington',
    location: 'Richmond, CA',
    system: 'Solar Energy System (8.0 kW)',
    date: 'Oct 21, 2026',
    status: 'review',
    statusLabel: 'Site Energy Audit Completed',
    reward: 500,
    payoutMethod: 'Pending Contract Execution',
  },
];

export default function HomeownerPortalPage() {
  const [activeTab, setActiveTab] = useState<'powerwall' | 'referrals' | 'savings' | 'concierge'>('powerwall');
  
  // Powerwall / Energy Firewall state
  const [isOutageSimulated, setIsOutageSimulated] = useState(false);
  const [backupReserve, setBackupReserve] = useState(25);
  const [batteryPct, setBatteryPct] = useState(88);
  const batteryKwh = 23.8;
  const batteryCapacity = 27.0;

  // Referral system state
  const [rewardTier, setRewardTier] = useState<number>(1000);
  const [referralCount, setReferralCount] = useState<number>(3);
  const [referrals, setReferrals] = useState<ReferralRecord[]>(() => {
    try {
      const saved = localStorage.getItem('pg_homeowner_referrals');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // Fallback
    }
    return INITIAL_REFERRALS;
  });

  // Direct Referral Form State
  const [refName, setRefName] = useState('');
  const [refPhone, setRefPhone] = useState('');
  const [refEmail, setRefEmail] = useState('');
  const [refAddress, setRefAddress] = useState('');
  const [refUtility, setRefUtility] = useState('Entergy Texas');
  const [refBill, setRefBill] = useState('$250 - $350');
  const [refNotes, setRefNotes] = useState('');
  const [formFeedback, setFormFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sharing & Modal state
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  const referralCode = 'PG-HORACE-7721';
  const referralUrl = `https://thepowergenie.theroyeffect.com/?ref=${referralCode}&tier=${rewardTier}`;

  useEffect(() => {
    document.title = 'Homeowner Portal & Tesla Firewall — The Power Genie';
    try {
      localStorage.setItem('pg_homeowner_referrals', JSON.stringify(referrals));
    } catch (e) {
      // Ignore
    }
  }, [referrals]);

  // Handle URL hash routing
  useEffect(() => {
    const hash = window.location.hash.toLowerCase();
    if (hash.includes('referral')) setActiveTab('referrals');
    else if (hash.includes('saving')) setActiveTab('savings');
    else if (hash.includes('concierge') || hash.includes('warranty')) setActiveTab('concierge');
    else if (hash.includes('powerwall') || hash.includes('firewall')) setActiveTab('powerwall');
  }, []);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const handleDirectReferralSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);

    // Explicit validation so button never fails silently
    if (!refName.trim()) {
      setFormFeedback({ type: 'error', message: 'Please enter your referral neighbor’s full name.' });
      document.getElementById('refNeighborName')?.focus();
      return;
    }
    if (!refPhone.trim() || refPhone.trim().length < 7) {
      setFormFeedback({ type: 'error', message: 'Please provide a valid phone number so Horace can coordinate.' });
      document.getElementById('refNeighborPhone')?.focus();
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      const newReferral: ReferralRecord = {
        id: `REF-${Math.floor(1000 + Math.random() * 9000)}`,
        name: refName.trim(),
        location: refAddress.trim() || 'Houston Metro Area, TX',
        system: `Solar + Tesla Powerwall 3 (${refUtility}, ${refBill}/mo)`,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        status: 'pending',
        statusLabel: 'Referral Submitted (Horace Lawrence Contacting)',
        reward: rewardTier,
        payoutMethod: 'Direct Deposit on PTO',
      };

      const updated = [newReferral, ...referrals];
      setReferrals(updated);

      setFormFeedback({
        type: 'success',
        message: `🎉 Referral for ${refName.trim()} received! $${rewardTier.toLocaleString()} reward locked in. Horace Lawrence will reach out today!`,
      });

      // Clear fields
      setRefName('');
      setRefPhone('');
      setRefEmail('');
      setRefAddress('');
      setRefNotes('');
      setIsSubmitting(false);

      // Scroll to pipeline
      setTimeout(() => {
        document.getElementById('referralPipelineSection')?.scrollIntoView({ behavior: 'smooth' });
      }, 200);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-[#07131F] text-[#F3F7FA] font-sans antialiased">
      {/* Top Banner Navigation */}
      <header className="sticky top-0 z-50 border-b border-[#1E2E42] bg-[#0A1828]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <a href="/" className="inline-flex items-center gap-2 text-white no-underline">
              <BrandMark />
            </a>
            <span className="hidden sm:inline-block h-4 w-px bg-white/20" />
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[#14314A] px-2.5 py-0.5 text-xs font-semibold text-[#64B5F6]">
              <Shield className="h-3.5 w-3.5 text-[#4CAF50]" /> Verified Tesla & Sunrun Homeowner
            </span>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="tel:+15102417007"
              className="inline-flex items-center gap-2 rounded-full border border-[#234567] bg-[#0E253B] px-3.5 py-1.5 text-xs font-semibold text-[#90CAF9] hover:bg-[#143452] transition"
            >
              <Phone className="h-3.5 w-3.5 text-[#FF6B00]" />
              <span className="hidden md:inline">Advisor Horace Lawrence:</span> 510-241-7007
            </a>
          </div>
        </div>
      </header>

      {/* Hero Welcome Bar */}
      <div className="border-b border-[#15273C] bg-gradient-to-r from-[#0C1E32] via-[#091B2E] to-[#07131F] px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-[#4CAF50] animate-pulse" />
              <p className="m-0 text-xs font-semibold uppercase tracking-[0.14em] text-[#4CAF50]">
                {isOutageSimulated ? 'Microgrid Island Mode Active (Protected)' : 'Tesla Energy Firewall Online & Resilient'}
              </p>
            </div>
            <h1 className="m-0 mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Homeowner Portal & Energy Firewall
            </h1>
            <p className="m-0 mt-1 text-sm text-[#8EA3B8]">
              Dual Tesla Powerwall 3 (27.0 kWh) · 12.8 kW Solar System · Oakland Hills Estate
            </p>
          </div>

          {/* Quick Action Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('referrals')}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65100] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#FF6B00]/20 hover:brightness-110 transition active:scale-95"
            >
              <DollarSign className="h-4 w-4" /> Refer & Earn $1,000 Cash
            </button>
            <button
              onClick={() => setActiveTab('powerwall')}
              className="inline-flex items-center gap-2 rounded-xl border border-[#244263] bg-[#0E2841] px-3.5 py-2.5 text-sm font-semibold text-[#A9C8E8] hover:bg-[#143452] transition"
            >
              <Battery className="h-4 w-4 text-[#4CAF50]" /> Powerwall Telemetry
            </button>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="border-b border-[#182C44] bg-[#091A2C]">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-1.5 sm:px-6">
          <button
            onClick={() => setActiveTab('powerwall')}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition whitespace-nowrap ${
              activeTab === 'powerwall'
                ? 'border-[#4CAF50] text-[#81C784]'
                : 'border-transparent text-[#7F9EB8] hover:text-white'
            }`}
          >
            <Battery className="h-4 w-4" /> 🔋 Tesla Powerwall & Energy Firewall
          </button>

          <button
            onClick={() => setActiveTab('referrals')}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition whitespace-nowrap ${
              activeTab === 'referrals'
                ? 'border-[#FF6B00] text-[#FF8A2B]'
                : 'border-transparent text-[#7F9EB8] hover:text-white'
            }`}
          >
            <Users className="h-4 w-4" /> 🤝 Refer Homeowners ($1,000 Reward)
          </button>

          <button
            onClick={() => setActiveTab('savings')}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition whitespace-nowrap ${
              activeTab === 'savings'
                ? 'border-[#2196F3] text-[#64B5F6]'
                : 'border-transparent text-[#7F9EB8] hover:text-white'
            }`}
          >
            <TrendingUp className="h-4 w-4" /> 📊 Bill Savings & Performance
          </button>

          <button
            onClick={() => setActiveTab('concierge')}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition whitespace-nowrap ${
              activeTab === 'concierge'
                ? 'border-[#E0E0E0] text-white'
                : 'border-transparent text-[#7F9EB8] hover:text-white'
            }`}
          >
            <Shield className="h-4 w-4" /> 🛡️ Sunrun Rep & Warranty
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* ========================================================================= */}
        {/* TAB 1: TESLA POWERWALL & ENERGY FIREWALL */}
        {/* ========================================================================= */}
        {activeTab === 'powerwall' && (
          <div className="space-y-6">
            {/* Outage Simulation Alert / Banner */}
            {isOutageSimulated ? (
              <div className="rounded-2xl border-2 border-[#FF6B00] bg-[#FF6B00]/10 p-5 text-white shadow-xl shadow-[#FF6B00]/10 animate-fade-in">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FF6B00]/20 text-[#FF6B00]">
                      <AlertTriangle className="h-6 w-6" />
                    </span>
                    <div>
                      <h3 className="m-0 text-base font-bold text-[#FF8A2B]">
                        Tesla Microgrid Island Mode Engaged — Grid Power Contactor Open
                      </h3>
                      <p className="m-0 text-xs sm:text-sm text-[#FFD0AD]">
                        The Tesla Backup Gateway has isolated your home from the utility grid in 8 milliseconds. All essential loads (AC, fridge, lights, Wi-Fi) are safely powered by your Powerwall 3.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsOutageSimulated(false)}
                    className="shrink-0 rounded-xl bg-[#4CAF50] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow hover:bg-[#43A047] transition"
                  >
                    Restore Grid Power
                  </button>
                </div>
              </div>
            ) : null}

            {/* Core Telemetry Cards */}
            <div className="grid gap-6 md:grid-cols-3">
              {/* Card 1: Powerwall Battery Gauge */}
              <div className="rounded-2xl border border-[#1B324B] bg-[#0C1E32] p-5 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#7E98B0]">State of Charge</span>
                  <span className="rounded-full bg-[#4CAF50]/15 px-2.5 py-0.5 text-xs font-bold text-[#4CAF50]">
                    {isOutageSimulated ? 'Discharging (Island)' : 'Optimal Charging'}
                  </span>
                </div>

                <div className="my-5 flex items-center justify-center">
                  <div className="relative flex h-40 w-40 items-center justify-center rounded-full border-4 border-[#163556] bg-[#081726]">
                    <div className="text-center">
                      <span className="text-4xl font-black text-white">{batteryPct}%</span>
                      <p className="m-0 text-xs font-medium text-[#7E98B0]">
                        {batteryKwh} / {batteryCapacity} kWh
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 border-t border-white/10 pt-3 text-xs text-[#8BA4BD]">
                  <div className="flex justify-between">
                    <span>Est. Backup Runtime:</span>
                    <strong className="text-white">18 hrs 42 mins</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Inverter Max Output:</span>
                    <strong className="text-white">11.5 kW Continuous</strong>
                  </div>
                </div>
              </div>

              {/* Card 2: Real-time Power Flow Nodes */}
              <div className="rounded-2xl border border-[#1B324B] bg-[#0C1E32] p-5 shadow-lg md:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#7E98B0]">Live Microgrid Energy Flow</span>
                  <span className="text-xs text-[#4CAF50] font-semibold">● Real-time Telemetry (Tesla Gateway 2)</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  {/* Node: Solar */}
                  <div className="rounded-xl border border-[#28496B] bg-[#081827] p-3">
                    <Sun className="mx-auto h-6 w-6 text-[#FFB300] mb-1" />
                    <p className="m-0 text-xs text-[#7E98B0]">Solar Roof</p>
                    <p className="m-0 text-lg font-bold text-[#FFB300]">8.4 kW</p>
                    <span className="text-[10px] text-[#4CAF50]">Producing</span>
                  </div>

                  {/* Node: Powerwall */}
                  <div className="rounded-xl border border-[#28496B] bg-[#081827] p-3">
                    <Battery className="mx-auto h-6 w-6 text-[#4CAF50] mb-1" />
                    <p className="m-0 text-xs text-[#7E98B0]">Powerwall 3</p>
                    <p className="m-0 text-lg font-bold text-[#4CAF50]">{isOutageSimulated ? '-2.6 kW' : '+4.6 kW'}</p>
                    <span className="text-[10px] text-[#4CAF50]">{isOutageSimulated ? 'Discharging' : 'Storing Power'}</span>
                  </div>

                  {/* Node: Home */}
                  <div className="rounded-xl border border-[#28496B] bg-[#081827] p-3">
                    <HomeIcon className="mx-auto h-6 w-6 text-[#64B5F6] mb-1" />
                    <p className="m-0 text-xs text-[#7E98B0]">Home Load</p>
                    <p className="m-0 text-lg font-bold text-[#64B5F6]">2.6 kW</p>
                    <span className="text-[10px] text-[#7E98B0]">AC & Appliances</span>
                  </div>

                  {/* Node: Grid */}
                  <div className={`rounded-xl border p-3 ${isOutageSimulated ? 'border-red-500/50 bg-red-950/20' : 'border-[#28496B] bg-[#081827]'}`}>
                    <Zap className={`mx-auto h-6 w-6 mb-1 ${isOutageSimulated ? 'text-red-400' : 'text-[#81C784]'}`} />
                    <p className="m-0 text-xs text-[#7E98B0]">Utility Grid</p>
                    <p className={`m-0 text-lg font-bold ${isOutageSimulated ? 'text-red-400' : 'text-[#81C784]'}`}>
                      {isOutageSimulated ? '0.0 kW' : '+1.2 kW'}
                    </p>
                    <span className={`text-[10px] ${isOutageSimulated ? 'text-red-400 font-semibold' : 'text-[#81C784]'}`}>
                      {isOutageSimulated ? 'ISOLATED / DOWN' : 'Exporting Credits'}
                    </span>
                  </div>
                </div>

                {/* Simulation Contactor Control */}
                <div className="mt-5 rounded-xl border border-[#1E3B5C] bg-[#081624] p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div>
                    <h4 className="m-0 text-sm font-bold text-white">Tesla Energy Firewall Blackout Simulator</h4>
                    <p className="m-0 text-xs text-[#8BA4BD]">
                      Test your home microgrid contactor to verify island mode resilience without waiting for a storm.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsOutageSimulated(!isOutageSimulated)}
                    className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                      isOutageSimulated
                        ? 'bg-[#4CAF50] text-white hover:bg-[#43A047]'
                        : 'bg-[#FF6B00] text-white hover:bg-[#F57C00]'
                    }`}
                  >
                    {isOutageSimulated ? '✓ Reconnect Grid' : '⚡ Simulate Grid Outage'}
                  </button>
                </div>
              </div>
            </div>

            {/* Backup Reserve Slider & Firewall Protection Diagnostics */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-[#1B324B] bg-[#0C1E32] p-5 shadow-lg">
                <h3 className="m-0 text-base font-bold text-white flex items-center gap-2">
                  <Shield className="h-5 w-5 text-[#4CAF50]" /> Storm Watch & Backup Reserve
                </h3>
                <p className="mt-1 text-xs text-[#8BA4BD]">
                  Set the minimum battery capacity reserved exclusively for blackout protection.
                </p>

                <div className="my-6">
                  <div className="flex justify-between text-sm mb-2 font-semibold">
                    <span>Reserve Percentage</span>
                    <span className="text-[#4CAF50]">{backupReserve}% ({((batteryCapacity * backupReserve) / 100).toFixed(1)} kWh)</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    step="5"
                    value={backupReserve}
                    onChange={(e) => setBackupReserve(Number(e.target.value))}
                    className="w-full h-2 rounded-lg bg-[#18314C] accent-[#4CAF50] cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-[#5D7A96] mt-1 font-mono">
                    <span>20% (Daily Savings)</span>
                    <span>50% (Balanced)</span>
                    <span>100% (Full Storm)</span>
                  </div>
                </div>

                <div className="rounded-xl bg-[#081827] p-3 text-xs text-[#8BA4BD] space-y-1">
                  <p className="m-0 font-semibold text-white">🌪️ Tesla Storm Watch: ENABLED</p>
                  <p className="m-0 text-[11px]">
                    National Weather Service alerts automatically pre-charge your battery to 100% before storms hit.
                  </p>
                </div>
              </div>

              {/* Firewall Technical Health Status */}
              <div className="rounded-2xl border border-[#1B324B] bg-[#0C1E32] p-5 shadow-lg">
                <h3 className="m-0 text-base font-bold text-white flex items-center gap-2">
                  <Activity className="h-5 w-5 text-[#2196F3]" /> Energy Firewall System Diagnostics
                </h3>
                <p className="mt-1 text-xs text-[#8BA4BD]">
                  Continuous hardware telemetry verified by Tesla Gateway 2 controller.
                </p>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between rounded-xl bg-[#081827] px-3.5 py-2.5 text-xs">
                    <span className="text-[#8BA4BD]">Microgrid Contactor Status:</span>
                    <span className="font-semibold text-[#4CAF50]">● Nominal (Sub-10ms Islanding Ready)</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-[#081827] px-3.5 py-2.5 text-xs">
                    <span className="text-[#8BA4BD]">Line Frequency Synchronization:</span>
                    <span className="font-semibold text-white">60.00 Hz (Locked)</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-[#081827] px-3.5 py-2.5 text-xs">
                    <span className="text-[#8BA4BD]">Thermal Protection & Liquid Cooling:</span>
                    <span className="font-semibold text-[#4CAF50]">Optimal (68°F Internal Core)</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-[#081827] px-3.5 py-2.5 text-xs">
                    <span className="text-[#8BA4BD]">Overvoltage & Lightning Surge Suppressor:</span>
                    <span className="font-semibold text-[#4CAF50]">Active & Protected</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: REFERRAL SYSTEM ($1,000 CASH REWARD) */}
        {/* ========================================================================= */}
        {activeTab === 'referrals' && (
          <div className="space-y-8">
            {/* Hero Banner: $1,000 Referral Program */}
            <div className="rounded-3xl border border-[#FF6B00]/40 bg-gradient-to-br from-[#1A1208] via-[#101F31] to-[#0A1828] p-6 sm:p-8 shadow-2xl relative overflow-hidden">
              <div className="relative z-10 max-w-2xl">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FF6B00]/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#FF8A2B]">
                  ⭐ Verified Homeowner Rewards
                </span>
                <h2 className="m-0 mt-3 text-3xl sm:text-4xl font-black tracking-tight text-white">
                  Earn ${rewardTier.toLocaleString()} For Every Homeowner You Refer.
                </h2>
                <p className="m-0 mt-2 text-sm sm:text-base text-[#D4E2EE] leading-relaxed">
                  Help your friends and neighbors ditch rising electric utility bills and secure whole-home Tesla battery protection. You receive <strong className="text-[#FF8A2B]">${rewardTier.toLocaleString()} cash via Zelle or Direct Deposit</strong> as soon as their system installs.
                </p>

                {/* Reward Tier Selector */}
                <div className="mt-6">
                  <p className="m-0 text-xs font-bold uppercase tracking-wider text-[#8FAEC7] mb-2">Select Referral Tier:</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { amount: 500, label: 'Standard Solar', note: '$500 reward' },
                      { amount: 1000, label: 'Solar + Tesla Powerwall 3', note: '$1,000 reward (Most Popular)' },
                      { amount: 1500, label: 'Multi-Battery / Commercial', note: '$1,500 reward' },
                    ].map((tier) => (
                      <button
                        key={tier.amount}
                        type="button"
                        onClick={() => setRewardTier(tier.amount)}
                        className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                          rewardTier === tier.amount
                            ? 'border-[#FF6B00] bg-[#FF6B00] text-white shadow-md shadow-[#FF6B00]/30'
                            : 'border-[#244263] bg-[#0A1D30] text-[#A5C3DF] hover:border-[#386494]'
                        }`}
                      >
                        {tier.label} · ${tier.amount}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Earnings Calculator */}
            <div className="rounded-2xl border border-[#1F3752] bg-[#0C1E32] p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="m-0 text-lg font-bold text-white flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-[#FFB300]" /> Dynamic Referral Earnings Calculator
                  </h3>
                  <p className="m-0 text-xs text-[#8BA4BD]">
                    Adjust the slider to see how fast referral payouts add up.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-[#8BA4BD]">Estimated Total Cash:</span>
                  <p className="m-0 text-3xl font-black text-[#FFB300]">
                    ${(referralCount * rewardTier).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="my-6">
                <div className="flex justify-between text-sm mb-2 font-semibold">
                  <span>Number of Referrals:</span>
                  <span className="text-white font-bold">{referralCount} Homeowners</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={referralCount}
                  onChange={(e) => setReferralCount(Number(e.target.value))}
                  className="w-full h-2.5 rounded-lg bg-[#18314C] accent-[#FF6B00] cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-[#5D7A96] mt-1 font-mono">
                  <span>1 ($ {rewardTier.toLocaleString()})</span>
                  <span>5 ($ {(5 * rewardTier).toLocaleString()})</span>
                  <span>10 ($ {(10 * rewardTier).toLocaleString()})</span>
                </div>
              </div>
            </div>

            {/* 1-Click Share & Custom Link Bar */}
            <div className="rounded-2xl border border-[#1F3752] bg-[#0C1E32] p-6 shadow-xl">
              <h3 className="m-0 text-base font-bold text-white flex items-center gap-2">
                <Share2 className="h-5 w-5 text-[#64B5F6]" /> Your Personal Referral Link
              </h3>
              <p className="mt-1 text-xs text-[#8BA4BD]">
                Share your personalized link. When homeowners book through it, you are automatically attributed.
              </p>

              <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="flex-1 rounded-xl border border-[#234567] bg-[#081827] px-3.5 py-2.5 font-mono text-xs text-[#90CAF9] truncate">
                  {referralUrl}
                </div>
                <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1E3B5C] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#29507D] transition"
                >
                  {copiedLink ? <Check className="h-4 w-4 text-[#4CAF50]" /> : <Copy className="h-4 w-4" />}
                  {copiedLink ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                  onClick={() => setShowQrModal(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#244263] bg-[#0C243B] px-3.5 py-2.5 text-xs font-bold text-white hover:bg-[#133352] transition"
                >
                  <QrCode className="h-4 w-4 text-[#FFB300]" /> QR Code
                </button>
              </div>

              {/* Fast Social & Message Buttons */}
              <div className="mt-4 flex flex-wrap gap-2 pt-4 border-t border-white/10">
                <a
                  href={`sms:?&body=Hey!%20We%20installed%20Sunrun%20solar%20with%20a%20Tesla%20Powerwall%20and%20cut%20our%20electric%20bill%20to%20almost%20nothing.%20Check%20it%20out%20and%20get%20a%20free%20consult%20with%20our%20advisor%20Horace:%20${encodeURIComponent(referralUrl)}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#14314A] px-3 py-1.5 text-xs font-semibold text-[#82B1FF] hover:bg-[#1A3E5E] transition no-underline"
                >
                  💬 Share via Text Message (SMS)
                </a>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Check out The Power Genie Sunrun solar & Tesla Powerwall: ${referralUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0F392B] px-3 py-1.5 text-xs font-semibold text-[#69F0AE] hover:bg-[#144D3A] transition no-underline"
                >
                  🟢 Share on WhatsApp
                </a>
                <a
                  href={`mailto:?subject=${encodeURIComponent("Lower your electric bill with Sunrun & Tesla Powerwall")}&body=${encodeURIComponent(`Hi,\n\nWe installed Sunrun solar and a Tesla Powerwall through The Power Genie and cut our electric bill dramatically.\n\nTake a look here: ${referralUrl}\n\nAsk for Horace Lawrence!`)}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#2D1F42] px-3 py-1.5 text-xs font-semibold text-[#D1C4E9] hover:bg-[#3D2B59] transition no-underline"
                >
                  ✉️ Share via Email
                </a>
              </div>
            </div>

            {/* DIRECT REFERRAL FORM */}
            <div className="rounded-2xl border-2 border-[#FF6B00]/60 bg-[#0C1E32] p-6 sm:p-8 shadow-2xl">
              <div className="border-b border-white/10 pb-4 mb-6">
                <span className="text-xs font-bold uppercase tracking-wider text-[#FF6B00]">Instant Submission</span>
                <h3 className="m-0 text-xl sm:text-2xl font-bold text-white">
                  Refer A Neighbor Directly to Horace Lawrence
                </h3>
                <p className="m-0 mt-1 text-xs sm:text-sm text-[#8BA4BD]">
                  Enter your neighbor’s contact information below. Horace will personally perform a free satellite solar design and reach out respectfully.
                </p>
              </div>

              {formFeedback && (
                <div
                  className={`mb-6 rounded-xl p-4 text-sm font-semibold flex items-center gap-3 ${
                    formFeedback.type === 'success'
                      ? 'bg-[#123824] border border-[#2E7D32] text-[#81C784]'
                      : 'bg-[#3E1616] border border-[#C62828] text-[#EF9A9A]'
                  }`}
                >
                  {formFeedback.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertTriangle className="h-5 w-5 shrink-0" />}
                  <span>{formFeedback.message}</span>
                </div>
              )}

              <form id="directReferralForm" onSubmit={handleDirectReferralSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="refNeighborName" className="block text-xs font-bold uppercase tracking-wider text-[#A5C3DF] mb-1">
                      Neighbor's Full Name *
                    </label>
                    <input
                      id="refNeighborName"
                      type="text"
                      required
                      placeholder="e.g. Jordan Miller"
                      value={refName}
                      onChange={(e) => setRefName(e.target.value)}
                      className="w-full rounded-xl border border-[#234567] bg-[#081827] px-3.5 py-3 text-sm text-white placeholder-[#5A738E] focus:border-[#FF6B00] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="refNeighborPhone" className="block text-xs font-bold uppercase tracking-wider text-[#A5C3DF] mb-1">
                      Neighbor's Mobile Phone *
                    </label>
                    <input
                      id="refNeighborPhone"
                      type="tel"
                      required
                      placeholder="e.g. 510-555-0199"
                      value={refPhone}
                      onChange={(e) => setRefPhone(e.target.value)}
                      className="w-full rounded-xl border border-[#234567] bg-[#081827] px-3.5 py-3 text-sm text-white placeholder-[#5A738E] focus:border-[#FF6B00] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="refNeighborEmail" className="block text-xs font-bold uppercase tracking-wider text-[#A5C3DF] mb-1">
                      Neighbor's Email (Optional)
                    </label>
                    <input
                      id="refNeighborEmail"
                      type="email"
                      placeholder="e.g. jordan@example.com"
                      value={refEmail}
                      onChange={(e) => setRefEmail(e.target.value)}
                      className="w-full rounded-xl border border-[#234567] bg-[#081827] px-3.5 py-3 text-sm text-white placeholder-[#5A738E] focus:border-[#FF6B00] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="refNeighborAddress" className="block text-xs font-bold uppercase tracking-wider text-[#A5C3DF] mb-1">
                      Home Street Address or Neighborhood
                    </label>
                    <input
                      id="refNeighborAddress"
                      type="text"
                      placeholder="e.g. 742 Evergreen Terrace, Oakland CA"
                      value={refAddress}
                      onChange={(e) => setRefAddress(e.target.value)}
                      className="w-full rounded-xl border border-[#234567] bg-[#081827] px-3.5 py-3 text-sm text-white placeholder-[#5A738E] focus:border-[#FF6B00] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="refUtility" className="block text-xs font-bold uppercase tracking-wider text-[#A5C3DF] mb-1">
                      Electric Utility
                    </label>
                    <select
                      id="refUtility"
                      value={refUtility}
                      onChange={(e) => setRefUtility(e.target.value)}
                      className="w-full rounded-xl border border-[#234567] bg-[#081827] px-3.5 py-3 text-sm text-white focus:border-[#FF6B00] focus:outline-none"
                    >
                      <option value="Entergy Texas">Entergy Texas</option>
                      <option value="CenterPoint Houston">CenterPoint Houston</option>
                      <option value="Oncor Electric">Oncor Electric</option>
                      <option value="PG&E Northern California">PG&E Northern California</option>
                      <option value="Other / Co-op">Other / Co-op</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="refBill" className="block text-xs font-bold uppercase tracking-wider text-[#A5C3DF] mb-1">
                      Estimated Monthly Electric Bill
                    </label>
                    <select
                      id="refBill"
                      value={refBill}
                      onChange={(e) => setRefBill(e.target.value)}
                      className="w-full rounded-xl border border-[#234567] bg-[#081827] px-3.5 py-3 text-sm text-white focus:border-[#FF6B00] focus:outline-none"
                    >
                      <option value="$150 - $250">$150 - $250 / mo</option>
                      <option value="$250 - $350">$250 - $350 / mo</option>
                      <option value="$350 - $500">$350 - $500 / mo</option>
                      <option value="$500+">$500+ / mo (High Power Usage)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="refNotes" className="block text-xs font-bold uppercase tracking-wider text-[#A5C3DF] mb-1">
                    Notes for Horace (Optional)
                  </label>
                  <textarea
                    id="refNotes"
                    rows={2}
                    placeholder="e.g. They had power outages last summer and are very interested in battery backup."
                    value={refNotes}
                    onChange={(e) => setRefNotes(e.target.value)}
                    className="w-full rounded-xl border border-[#234567] bg-[#081827] px-3.5 py-2.5 text-sm text-white placeholder-[#5A738E] focus:border-[#FF6B00] focus:outline-none"
                  />
                </div>

                {/* Submit Referral Button (Explicitly clickable, NEVER disabled) */}
                <div className="pt-2">
                  <button
                    id="btnSubmitReferral"
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full min-h-[52px] rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65100] px-6 py-3.5 text-base font-extrabold text-white shadow-xl shadow-[#FF6B00]/30 hover:brightness-110 active:scale-[0.99] transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <span>Submitting referral to Horace…</span>
                    ) : (
                      <>
                        <DollarSign className="h-5 w-5" />
                        <span>Submit Referral & Lock In ${rewardTier.toLocaleString()} Reward</span>
                      </>
                    )}
                  </button>
                  <p className="mt-2 text-center text-[11px] text-[#7A9BB8]">
                    No spam. Horace Lawrence will reach out respectfully to provide a customized proposal.
                  </p>
                </div>
              </form>
            </div>

            {/* LIVE REFERRAL PIPELINE TABLE */}
            <div id="referralPipelineSection" className="rounded-2xl border border-[#1F3752] bg-[#0C1E32] p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-white/10 pb-4 mb-4">
                <div>
                  <h3 className="m-0 text-lg font-bold text-white flex items-center gap-2">
                    <Award className="h-5 w-5 text-[#FF6B00]" /> Your Referral Rewards Pipeline
                  </h3>
                  <p className="m-0 text-xs text-[#8BA4BD]">Track the live progress of each homeowner you referred.</p>
                </div>
                <span className="rounded-full bg-[#163652] px-3 py-1 text-xs font-semibold text-[#82B1FF]">
                  {referrals.length} Total Referrals Tracked
                </span>
              </div>

              <div className="space-y-3">
                {referrals.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-[#1E3957] bg-[#081827] p-4 transition hover:border-[#2C537D]"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-base font-bold text-white">{r.name}</strong>
                        <span className="rounded bg-[#17304A] px-2 py-0.5 text-[10px] font-mono text-[#8EAEC9]">
                          {r.id}
                        </span>
                      </div>
                      <p className="m-0 text-xs text-[#8BA4BD]">{r.location}</p>
                      <p className="m-0 mt-0.5 text-xs text-[#688FA8]">{r.system}</p>
                    </div>

                    <div className="flex flex-col sm:items-end w-full sm:w-auto">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                          r.status === 'paid'
                            ? 'bg-[#184628] text-[#81C784]'
                            : r.status === 'pending'
                            ? 'bg-[#422D0B] text-[#FFB74D]'
                            : 'bg-[#21354A] text-[#90CAF9]'
                        }`}
                      >
                        {r.status === 'paid' ? '✓' : '●'} {r.statusLabel}
                      </span>
                      <p className="m-0 mt-1 text-sm font-extrabold text-[#FFB300]">
                        ${r.reward.toLocaleString()} ({r.payoutMethod})
                      </p>
                      <span className="text-[10px] text-[#637C94]">Submitted: {r.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: BILL SAVINGS & PERFORMANCE */}
        {/* ========================================================================= */}
        {activeTab === 'savings' && (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-2xl border border-[#1B324B] bg-[#0C1E32] p-5 shadow-lg">
                <span className="text-xs uppercase font-semibold text-[#7E98B0]">Utility Bill Comparison</span>
                <div className="mt-4 flex items-baseline justify-between">
                  <div>
                    <span className="text-xs text-[#E57373]">Before Solar</span>
                    <p className="m-0 text-2xl font-black text-white">$385/mo</p>
                  </div>
                  <ChevronRight className="h-6 w-6 text-[#7E98B0]" />
                  <div>
                    <span className="text-xs text-[#81C784]">Sunrun + Powerwall</span>
                    <p className="m-0 text-2xl font-black text-[#81C784]">$18/mo</p>
                  </div>
                </div>
                <div className="mt-4 border-t border-white/10 pt-3 text-xs text-[#8BA4BD]">
                  Net Monthly Savings: <strong className="text-white">$367 / month</strong>
                </div>
              </div>

              <div className="rounded-2xl border border-[#1B324B] bg-[#0C1E32] p-5 shadow-lg">
                <span className="text-xs uppercase font-semibold text-[#7E98B0]">Lifetime Savings</span>
                <p className="m-0 mt-3 text-3xl font-black text-[#FFB300]">$4,820</p>
                <p className="m-0 mt-1 text-xs text-[#8BA4BD]">Saved since system installation (14 months active).</p>
                <div className="mt-4 border-t border-white/10 pt-3 text-xs text-[#8BA4BD]">
                  25-Year Projected Savings: <strong className="text-white">$74,500+</strong>
                </div>
              </div>

              <div className="rounded-2xl border border-[#1B324B] bg-[#0C1E32] p-5 shadow-lg">
                <span className="text-xs uppercase font-semibold text-[#7E98B0]">Environmental Offset</span>
                <p className="m-0 mt-3 text-3xl font-black text-[#64B5F6]">14.2 Tons</p>
                <p className="m-0 mt-1 text-xs text-[#8BA4BD]">CO2 greenhouse gas eliminated from grid.</p>
                <div className="mt-4 border-t border-white/10 pt-3 text-xs text-[#8BA4BD]">
                  Equivalent to: <strong className="text-white">328 Trees Planted</strong>
                </div>
              </div>
            </div>

            {/* Bill Statement Record */}
            <div className="rounded-2xl border border-[#1F3752] bg-[#0C1E32] p-6 shadow-xl">
              <h3 className="m-0 text-base font-bold text-white">Solar Production Guarantee & Performance</h3>
              <p className="mt-1 text-xs text-[#8BA4BD]">
                Sunrun guarantees 100% of your estimated annual kWh solar generation or compensates you directly.
              </p>
              <div className="mt-4 rounded-xl bg-[#081827] p-4 text-xs text-[#90CAF9] flex items-center justify-between">
                <span>System Production Target: 16,400 kWh / yr</span>
                <span className="font-bold text-[#4CAF50]">Current Performance: 104% of Target (Exceeding)</span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: SUNRUN ADVISOR & WARRANTY */}
        {/* ========================================================================= */}
        {activeTab === 'concierge' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#1B324B] bg-[#0C1E32] p-6 sm:p-8 shadow-xl">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#FF6B00]">Dedicated Sunrun Solar Expert</span>
                  <h2 className="m-0 mt-1 text-2xl font-bold text-white">Horace Lawrence</h2>
                  <p className="m-0 mt-0.5 text-sm text-[#8BA4BD]">The Block Sales Expert Team Lead · Sunrun</p>

                  <div className="mt-4 flex flex-wrap gap-4 text-sm">
                    <a href="tel:+15102417007" className="inline-flex items-center gap-2 text-white font-semibold hover:underline">
                      <Phone className="h-4 w-4 text-[#FF6B00]" /> 510-241-7007
                    </a>
                    <a href="mailto:horace.lawrence@sunrun.com" className="inline-flex items-center gap-2 text-white font-semibold hover:underline">
                      <Mail className="h-4 w-4 text-[#FF6B00]" /> horace.lawrence@sunrun.com
                    </a>
                  </div>
                </div>

                <div className="flex flex-col gap-2 w-full md:w-auto">
                  <a
                    href="/book"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF6B00] px-5 py-3 text-sm font-bold text-white hover:bg-[#F57C00] transition no-underline shadow-lg"
                  >
                    <Calendar className="h-4 w-4" /> Book Time With Horace
                  </a>
                  <a
                    href="tel:+15102417007"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#264A6E] bg-[#0E2841] px-5 py-2.5 text-xs font-semibold text-[#A9C8E8] hover:bg-[#153859] transition no-underline"
                  >
                    Direct Call: 510-241-7007
                  </a>
                </div>
              </div>
            </div>

            {/* Warranty Coverage */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-[#1B324B] bg-[#0C1E32] p-6 shadow-xl">
                <h3 className="m-0 text-base font-bold text-white flex items-center gap-2">
                  <Shield className="h-5 w-5 text-[#4CAF50]" /> 25-Year Sunrun System Guarantee
                </h3>
                <ul className="mt-4 space-y-2.5 text-xs text-[#8BA4BD] p-0 list-none">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#4CAF50]" /> Comprehensive panel, inverter, and roof penetration warranty.
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#4CAF50]" /> Automated 24/7 proactive monitoring & free maintenance repairs.
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#4CAF50]" /> Full system transferability if you ever sell your residence.
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-[#1B324B] bg-[#0C1E32] p-6 shadow-xl">
                <h3 className="m-0 text-base font-bold text-white flex items-center gap-2">
                  <Battery className="h-5 w-5 text-[#FFB300]" /> 10-Year Tesla Powerwall Warranty
                </h3>
                <ul className="mt-4 space-y-2.5 text-xs text-[#8BA4BD] p-0 list-none">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#FFB300]" /> Guaranteed 70% energy retention after 10 years unlimited cycles.
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#FFB300]" /> Tesla Backup Gateway microgrid contactor full protection.
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#FFB300]" /> Liquid cooling and over-the-air firmware optimizations.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-3xl border border-[#2B4E73] bg-[#0C1E32] p-6 text-center shadow-2xl">
            <h3 className="m-0 text-lg font-bold text-white">Neighbor Scan QR Code</h3>
            <p className="m-0 mt-1 text-xs text-[#8BA4BD]">
              Have your neighbor point their phone camera at this code to lock in your ${rewardTier.toLocaleString()} referral reward.
            </p>

            <div className="my-6 mx-auto flex h-48 w-48 items-center justify-center rounded-2xl bg-white p-3 shadow-inner">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(referralUrl)}`}
                alt="Referral QR Code"
                className="h-full w-full object-contain"
              />
            </div>

            <p className="m-0 font-mono text-xs text-[#64B5F6]">{referralCode}</p>

            <button
              onClick={() => setShowQrModal(false)}
              className="mt-5 w-full rounded-xl bg-[#1C3A5A] py-2.5 text-xs font-bold text-white hover:bg-[#28507B] transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
