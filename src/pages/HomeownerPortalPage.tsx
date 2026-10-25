import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
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
  CheckCircle2,
  Sparkles,
  Sliders,
  CheckCircle,
  CloudLightning,
  Snowflake,
  Wifi,
  Lightbulb,
  Wind,
  Utensils,
  Car,
  MessageSquare
} from 'lucide-react';
import { BrandMark } from '../hub/ui';
import { lockPageScroll } from '../lib/scrollLock';
import { trackInfoPageVisit } from '../lib/visitTrack';

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

interface ApplianceLoad {
  id: string;
  name: string;
  kw: number;
  essential: boolean;
  icon: React.ReactNode;
  desc: string;
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

const DEFAULT_APPLIANCES: ApplianceLoad[] = [
  { id: 'fridge', name: 'Refrigerator & Deep Freezer', kw: 0.35, essential: true, icon: <Snowflake className="h-4 w-4 text-cyan-400" />, desc: 'Critical food preservation & cooling' },
  { id: 'wifi', name: 'Wi-Fi 6 Router & Security Hub', kw: 0.15, essential: true, icon: <Wifi className="h-4 w-4 text-indigo-400" />, desc: 'Camera feeds, smart locks, work connection' },
  { id: 'lights', name: 'LED Interior Lighting & Outlets', kw: 0.25, essential: true, icon: <Lightbulb className="h-4 w-4 text-amber-300" />, desc: 'Living areas, bedrooms, device chargers' },
  { id: 'ac', name: 'Central Inverter Heat Pump / A/C', kw: 2.80, essential: false, icon: <Wind className="h-4 w-4 text-blue-400" />, desc: 'Whole-home climate comfort' },
  { id: 'kitchen', name: 'Microwave & Induction Cooking', kw: 1.40, essential: false, icon: <Utensils className="h-4 w-4 text-orange-400" />, desc: 'Emergency meal preparation' },
  { id: 'ev', name: 'Tesla / EV Level 2 Charging', kw: 5.50, essential: false, icon: <Car className="h-4 w-4 text-emerald-400" />, desc: 'High-draw home vehicle replenishment' },
];

export default function HomeownerPortalPage() {
  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const created = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    const prior = meta.content;
    meta.content = 'noindex, nofollow';
    return () => {
      if (created) meta?.remove();
      else if (meta) meta.content = prior;
    };
  }, []);

  const [activeTab, setActiveTab] = useState<'powerwall' | 'referrals' | 'savings' | 'concierge'>('powerwall');

  useEffect(() => {
    if (activeTab === 'referrals') {
      trackInfoPageVisit('/homeowner Referral Submission Form');
    }
  }, [activeTab]);

  // Powerwall / Energy Firewall state
  const [isOutageSimulated, setIsOutageSimulated] = useState(false);
  const [backupReserve, setBackupReserve] = useState(25);
  const [batteryPct, setBatteryPct] = useState(88);
  const batteryCapacity = 27.0; // Dual Powerwall 3 (13.5 kWh * 2)

  // Interactive appliance loads during blackout
  const [activeApplianceIds, setActiveApplianceIds] = useState<string[]>([
    'fridge',
    'wifi',
    'lights',
    'ac',
  ]);

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

  // Savings Inflation Simulator
  const [utilityInflationRate, setUtilityInflationRate] = useState<number>(4.5);

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

  useEffect(() => {
    if (!showQrModal) return;
    return lockPageScroll();
  }, [showQrModal]);

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

  const toggleAppliance = (id: string) => {
    setActiveApplianceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Compute live active load
  const applianceLoadKw = activeApplianceIds.reduce((sum, id) => {
    const app = DEFAULT_APPLIANCES.find((a) => a.id === id);
    return sum + (app ? app.kw : 0);
  }, 0);

  const solarGenerationKw = isOutageSimulated ? 6.2 : 8.4;
  const homeLoadKw = Number((0.6 + applianceLoadKw).toFixed(2));
  const currentBatteryKwh = (batteryCapacity * batteryPct) / 100;

  // Powerwall flow: in normal mode, excess solar charges battery; in outage, battery covers home load
  const batteryFlowKw = isOutageSimulated
    ? Number((homeLoadKw - Math.min(solarGenerationKw, homeLoadKw)).toFixed(1))
    : Number((Math.min(solarGenerationKw - homeLoadKw, 5.0)).toFixed(1));

  // Estimated runtime in hours based on available battery kWh vs net draw
  const netBlackoutDraw = Math.max(0.4, homeLoadKw - (solarGenerationKw * 0.4));
  const estRuntimeHours = Math.round((currentBatteryKwh / netBlackoutDraw) * 10) / 10;

  const handleDirectReferralSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);

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
        message: `Referral for ${refName.trim()} received! $${rewardTier.toLocaleString()} reward locked in. Horace Lawrence will reach out today!`,
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

  // SVG battery circle calculation
  const ringRadius = 70;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringStrokeOffset = ringCircumference - (batteryPct / 100) * ringCircumference;

  return (
    <div className="min-h-screen bg-[#07131F] text-[#F3F7FA] font-sans antialiased selection:bg-[#FF6B00]/30 selection:text-white">
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

          <div className="flex items-center gap-2.5">
            <a
              href="tel:+15102417007"
              className="inline-flex items-center gap-2 rounded-full border border-[#234567] bg-[#0E253B] px-3.5 py-1.5 text-xs font-semibold text-[#90CAF9] hover:bg-[#143452] transition shadow-sm"
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
              <span className={`inline-flex h-2.5 w-2.5 rounded-full ${isOutageSimulated ? 'bg-[#FF6B00] animate-ping' : 'bg-[#4CAF50] animate-pulse'}`} />
              <p className={`m-0 text-xs font-bold uppercase tracking-[0.14em] flex items-center gap-1.5 ${isOutageSimulated ? 'text-[#FF8A2B]' : 'text-[#4CAF50]'}`}>
                {isOutageSimulated ? (
                  <>
                    <Zap className="h-3.5 w-3.5 text-[#FF8A2B]" /> Microgrid Island Mode Engaged (Protected)
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5 text-[#4CAF50]" /> Tesla Energy Firewall Online & Resilient
                  </>
                )}
              </p>
            </div>
            <h1 className="m-0 mt-1.5 text-2xl sm:text-3xl font-black tracking-tight text-white">
              Homeowner Portal & Energy Firewall
            </h1>
            <p className="m-0 mt-1 text-sm text-[#8EA3B8]">
              Dual Tesla Powerwall 3 (27.0 kWh) · 12.8 kW Solar System · Oakland Hills Estate
            </p>
          </div>

          {/* Quick Action Badges */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setActiveTab('referrals')}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65100] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#FF6B00]/25 hover:brightness-110 transition active:scale-95 cursor-pointer"
            >
              <DollarSign className="h-4 w-4" /> Refer & Earn $1,000 Cash
            </button>
            <button
              onClick={() => setActiveTab('powerwall')}
              className="inline-flex items-center gap-2 rounded-xl border border-[#244263] bg-[#0E2841] px-3.5 py-2.5 text-sm font-semibold text-[#A9C8E8] hover:bg-[#143452] transition cursor-pointer"
            >
              <Battery className="h-4 w-4 text-[#4CAF50]" /> Powerwall Telemetry
            </button>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation - ZERO ugly horizontal scrollbar */}
      <div className="border-b border-[#182C44] bg-[#091A2C]">
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-2 sm:px-6 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setActiveTab('powerwall')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'powerwall'
                ? 'bg-[#123120] text-[#81C784] border border-[#2E7D32] shadow-sm shadow-[#4CAF50]/20'
                : 'text-[#8EAEC7] hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <Battery className={`h-4 w-4 ${activeTab === 'powerwall' ? 'text-[#4CAF50]' : 'text-[#8EAEC7]'}`} />
            <span>Tesla Powerwall 3 & Firewall</span>
          </button>

          <button
            onClick={() => setActiveTab('referrals')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'referrals'
                ? 'bg-[#3A1E08] text-[#FF8A2B] border border-[#FF6B00]/70 shadow-sm shadow-[#FF6B00]/20'
                : 'text-[#8EAEC7] hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <Users className={`h-4 w-4 ${activeTab === 'referrals' ? 'text-[#FF6B00]' : 'text-[#8EAEC7]'}`} />
            <span>Refer Homeowners ($1,000 Reward)</span>
            <span className="rounded-full bg-[#FF6B00] px-2 py-0.5 text-[10px] font-black text-white">
              HOT
            </span>
          </button>

          <button
            onClick={() => setActiveTab('savings')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'savings'
                ? 'bg-[#0F2942] text-[#64B5F6] border border-[#1E88E5]/70 shadow-sm shadow-[#2196F3]/20'
                : 'text-[#8EAEC7] hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <TrendingUp className={`h-4 w-4 ${activeTab === 'savings' ? 'text-[#2196F3]' : 'text-[#8EAEC7]'}`} />
            <span>Bill Savings & Performance</span>
          </button>

          <button
            onClick={() => setActiveTab('concierge')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'concierge'
                ? 'bg-[#212E3B] text-white border border-[#475569] shadow-sm'
                : 'text-[#8EAEC7] hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <Shield className={`h-4 w-4 ${activeTab === 'concierge' ? 'text-[#FFB300]' : 'text-[#8EAEC7]'}`} />
            <span>Sunrun Rep & VIP Warranty</span>
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
              <div className="rounded-2xl border-2 border-[#FF6B00] bg-gradient-to-r from-[#FF6B00]/15 via-[#FF6B00]/10 to-[#120800] p-5 text-white shadow-xl shadow-[#FF6B00]/15 animate-fade-in">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FF6B00]/25 text-[#FF6B00] shadow-inner">
                      <AlertTriangle className="h-6 w-6" />
                    </span>
                    <div>
                      <h3 className="m-0 text-base font-bold text-[#FF8A2B]">
                        Tesla Microgrid Island Mode Engaged — Grid Power Contactor Open (8ms)
                      </h3>
                      <p className="m-0 text-xs sm:text-sm text-[#FFD0AD] mt-0.5">
                        The Tesla Backup Gateway has completely isolated your home from the utility grid. Your active appliances ({activeApplianceIds.length} connected, {homeLoadKw} kW) are seamlessly powered by your Dual Powerwall 3.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsOutageSimulated(false)}
                    className="shrink-0 rounded-xl bg-[#4CAF50] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow hover:bg-[#43A047] transition cursor-pointer"
                  >
                    Restore Utility Grid
                  </button>
                </div>
              </div>
            ) : null}

            {/* Core Telemetry Cards */}
            <div className="grid gap-6 md:grid-cols-3">
              {/* Card 1: Powerwall Battery Gauge with Animated SVG */}
              <div className="rounded-2xl border border-[#1B324B] bg-gradient-to-b from-[#0C1E32] to-[#081726] p-5 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#7E98B0]">State of Charge</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold flex items-center gap-1 ${
                    isOutageSimulated ? 'bg-[#FF6B00]/20 text-[#FF9E4A]' : 'bg-[#4CAF50]/15 text-[#4CAF50]'
                  }`}>
                    {isOutageSimulated ? (
                      <>
                        <Zap className="h-3 w-3" /> Discharging (Island)
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3 w-3" /> Optimal Charging
                      </>
                    )}
                  </span>
                </div>

                {/* SVG Progress Ring */}
                <div className="my-4 flex items-center justify-center">
                  <div className="relative flex items-center justify-center">
                    <svg className="h-44 w-44 -rotate-90 transform" viewBox="0 0 160 160">
                      <defs>
                        <linearGradient id="batteryChargingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#4CAF50" />
                          <stop offset="100%" stopColor="#81C784" />
                        </linearGradient>
                        <linearGradient id="batteryDischargingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#FF6B00" />
                          <stop offset="100%" stopColor="#FFA040" />
                        </linearGradient>
                        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                          <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>
                      <circle
                        cx="80"
                        cy="80"
                        r={ringRadius}
                        stroke="#132B45"
                        strokeWidth="10"
                        fill="transparent"
                      />
                      <circle
                        cx="80"
                        cy="80"
                        r={ringRadius}
                        stroke={isOutageSimulated ? 'url(#batteryDischargingGrad)' : 'url(#batteryChargingGrad)'}
                        strokeWidth="10"
                        strokeDasharray={ringCircumference}
                        strokeDashoffset={ringStrokeOffset}
                        strokeLinecap="round"
                        fill="transparent"
                        filter="url(#glow)"
                        className="transition-all duration-700 ease-out"
                      />
                    </svg>

                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-3xl sm:text-4xl font-black tracking-tight text-white">{batteryPct}%</span>
                      <span className="text-xs font-semibold text-[#8FAEC7] mt-0.5">
                        {currentBatteryKwh.toFixed(1)} / {batteryCapacity.toFixed(1)} kWh
                      </span>
                      <span className="text-[10px] text-[#607D8B] font-mono mt-0.5">
                        Dual LFP Cells
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5 border-t border-white/10 pt-3 text-xs text-[#8BA4BD]">
                  <div className="flex justify-between items-center">
                    <span>Est. Backup Runtime:</span>
                    <strong className="text-white font-mono text-sm">{estRuntimeHours} Hours</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Inverter Max Output:</span>
                    <strong className="text-white font-mono">11.5 kW Continuous</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Peak Surge Starting Power:</span>
                    <strong className="text-[#81C784] font-mono">18.5 kW (LRA Ready)</strong>
                  </div>
                </div>
              </div>

              {/* Card 2: Interactive Real-time Microgrid Energy Flow */}
              <div className="rounded-2xl border border-[#1B324B] bg-[#0C1E32] p-5 shadow-xl md:col-span-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#7E98B0]">Live Microgrid Energy Flow</span>
                    <span className="text-xs text-[#4CAF50] font-semibold flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#4CAF50] animate-ping" />
                      Tesla Backup Gateway 2 Active
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    {/* Node 1: Solar */}
                    <div className="rounded-xl border border-[#28496B] bg-[#081827] p-3 relative overflow-hidden">
                      <Sun className="mx-auto h-6 w-6 text-[#FFB300] mb-1 animate-spin-slow" />
                      <p className="m-0 text-xs text-[#7E98B0]">Solar Roof</p>
                      <p className="m-0 text-lg font-bold text-[#FFB300]">{solarGenerationKw} kW</p>
                      <span className="text-[10px] text-[#4CAF50]">● Producing Clean DC</span>
                    </div>

                    {/* Node 2: Powerwall */}
                    <div className="rounded-xl border border-[#28496B] bg-[#081827] p-3">
                      <Battery className={`mx-auto h-6 w-6 mb-1 ${isOutageSimulated ? 'text-[#FF6B00]' : 'text-[#4CAF50]'}`} />
                      <p className="m-0 text-xs text-[#7E98B0]">Powerwall 3</p>
                      <p className={`m-0 text-lg font-bold ${isOutageSimulated ? 'text-[#FF6B00]' : 'text-[#4CAF50]'}`}>
                        {isOutageSimulated ? `-${batteryFlowKw} kW` : `+${batteryFlowKw} kW`}
                      </p>
                      <span className={`text-[10px] flex items-center justify-center gap-1 ${isOutageSimulated ? 'text-[#FF8A2B] font-semibold' : 'text-[#4CAF50]'}`}>
                        {isOutageSimulated ? (
                          <>
                            <Zap className="h-2.5 w-2.5 text-[#FF8A2B]" /> Discharging to Home
                          </>
                        ) : (
                          <>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#4CAF50]" /> Storing Solar
                          </>
                        )}
                      </span>
                    </div>

                    {/* Node 3: Home */}
                    <div className="rounded-xl border border-[#28496B] bg-[#081827] p-3">
                      <HomeIcon className="mx-auto h-6 w-6 text-[#64B5F6] mb-1" />
                      <p className="m-0 text-xs text-[#7E98B0]">Home Load</p>
                      <p className="m-0 text-lg font-bold text-[#64B5F6]">{homeLoadKw} kW</p>
                      <span className="text-[10px] text-[#90CAF9]">{activeApplianceIds.length} Appliances Active</span>
                    </div>

                    {/* Node 4: Grid */}
                    <div className={`rounded-xl border p-3 transition-colors ${
                      isOutageSimulated ? 'border-red-500/60 bg-red-950/30' : 'border-[#28496B] bg-[#081827]'
                    }`}>
                      <Zap className={`mx-auto h-6 w-6 mb-1 ${isOutageSimulated ? 'text-red-400' : 'text-[#81C784]'}`} />
                      <p className="m-0 text-xs text-[#7E98B0]">Utility Grid</p>
                      <p className={`m-0 text-lg font-bold ${isOutageSimulated ? 'text-red-400 font-mono' : 'text-[#81C784]'}`}>
                        {isOutageSimulated ? '0.0 kW' : '+1.2 kW'}
                      </p>
                      <span className={`text-[10px] flex items-center justify-center gap-1 ${isOutageSimulated ? 'text-red-400 font-bold' : 'text-[#81C784]'}`}>
                        {isOutageSimulated ? (
                          <>
                            <AlertTriangle className="h-2.5 w-2.5 text-red-400" /> CONTACTOR OPEN
                          </>
                        ) : (
                          <>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#81C784]" /> Exporting Credits
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Simulation Contactor Control */}
                <div className="mt-5 rounded-xl border border-[#1E3B5C] bg-[#081624] p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div>
                    <h4 className="m-0 text-sm font-bold text-white flex items-center gap-2">
                      <Zap className="h-4 w-4 text-[#FF6B00]" />
                      Tesla Energy Firewall Blackout Simulator
                    </h4>
                    <p className="m-0 text-xs text-[#8BA4BD] mt-0.5">
                      Verify your whole-home microgrid islanding response without waiting for severe weather.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsOutageSimulated(!isOutageSimulated)}
                    className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 ${
                      isOutageSimulated
                        ? 'bg-[#4CAF50] text-white hover:bg-[#43A047] shadow-lg shadow-[#4CAF50]/30'
                        : 'bg-gradient-to-r from-[#FF6B00] to-[#E65100] text-white hover:brightness-110 shadow-lg shadow-[#FF6B00]/30'
                    }`}
                  >
                    {isOutageSimulated ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Reconnect Utility Grid
                      </>
                    ) : (
                      <>
                        <Zap className="h-3.5 w-3.5" /> Simulate Grid Outage
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Blackout Appliance Load Tester & Runtime Optimizer */}
            <div className="rounded-2xl border border-[#1F3752] bg-[#0C1E32] p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-4 mb-4">
                <div>
                  <h3 className="m-0 text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <Sliders className="h-5 w-5 text-[#FFB300]" /> Blackout Appliance Load Management & Runtime Tester
                  </h3>
                  <p className="m-0 text-xs text-[#8BA4BD] mt-0.5">
                    Toggle home appliances on or off to see how your Powerwall backup duration dynamically changes.
                  </p>
                </div>
                <div className="rounded-xl bg-[#081827] px-3.5 py-1.5 border border-[#234567] text-right">
                  <span className="text-[10px] uppercase font-bold text-[#8FAEC7] block">Estimated Backup Runtime</span>
                  <span className="text-lg font-black text-[#81C784] font-mono">{estRuntimeHours} Hours</span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {DEFAULT_APPLIANCES.map((app) => {
                  const isActive = activeApplianceIds.includes(app.id);
                  return (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => toggleAppliance(app.id)}
                      className={`flex items-start justify-between p-3.5 rounded-xl border text-left transition cursor-pointer ${
                        isActive
                          ? 'border-[#2E7D32] bg-[#0B2518]'
                          : 'border-[#1C3652] bg-[#081726] opacity-60 hover:opacity-100 hover:border-[#2C537D]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-white/5 border border-white/10 mt-0.5">{app.icon}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <strong className="text-xs sm:text-sm font-bold text-white">{app.name}</strong>
                            {app.essential && (
                              <span className="rounded bg-[#1B432C] px-1.5 py-0.5 text-[9px] font-bold text-[#81C784]">
                                Essential
                              </span>
                            )}
                          </div>
                          <p className="m-0 text-[11px] text-[#8EAEC7] mt-0.5">{app.desc}</p>
                          <span className="inline-block mt-1 text-[11px] font-mono font-bold text-[#FFB300]">
                            {app.kw.toFixed(2)} kW draw
                          </span>
                        </div>
                      </div>
                      <span className={`h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                        isActive ? 'bg-[#4CAF50] text-white' : 'border border-[#38597E] text-transparent'
                      }`}>
                        {isActive ? <Check className="h-3 w-3 stroke-[3]" /> : null}
                      </span>
                    </button>
                  );
                })}
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
                  <p className="m-0 font-semibold text-white flex items-center gap-1.5">
                    <CloudLightning className="h-4 w-4 text-amber-400" /> Tesla Storm Watch: ENABLED
                  </p>
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
                        className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
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

            {/* Dynamic Earnings Calculator & Milestones */}
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

              {/* Referral Milestone Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-white/10">
                <div className={`rounded-xl p-3 border text-center ${referralCount >= 1 ? 'border-[#4CAF50] bg-[#102D1C]' : 'border-[#1E3752] bg-[#081827] opacity-60'}`}>
                  <span className="text-sm font-bold text-white">Bronze Tier</span>
                  <p className="m-0 text-[11px] text-[#81C784]">1 Referral ($1,000)</p>
                </div>
                <div className={`rounded-xl p-3 border text-center ${referralCount >= 3 ? 'border-[#2196F3] bg-[#0F2942]' : 'border-[#1E3752] bg-[#081827] opacity-60'}`}>
                  <span className="text-sm font-bold text-white">Silver Tier</span>
                  <p className="m-0 text-[11px] text-[#64B5F6]">3 Referrals ($3,000)</p>
                </div>
                <div className={`rounded-xl p-3 border text-center ${referralCount >= 5 ? 'border-[#FFB300] bg-[#3B2C0B]' : 'border-[#1E3752] bg-[#081827] opacity-60'}`}>
                  <span className="text-sm font-bold text-white">Gold Tier</span>
                  <p className="m-0 text-[11px] text-[#FFD54F]">5 Referrals ($5,000)</p>
                </div>
                <div className={`rounded-xl p-3 border text-center ${referralCount >= 10 ? 'border-[#E040FB] bg-[#381142]' : 'border-[#1E3752] bg-[#081827] opacity-60'}`}>
                  <span className="text-sm font-bold text-white">Platinum VIP</span>
                  <p className="m-0 text-[11px] text-[#EA80FC]">10 Referrals ($10,000)</p>
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
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1E3B5C] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#29507D] transition cursor-pointer"
                >
                  {copiedLink ? <Check className="h-4 w-4 text-[#4CAF50]" /> : <Copy className="h-4 w-4" />}
                  {copiedLink ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                  onClick={() => setShowQrModal(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#244263] bg-[#0C243B] px-3.5 py-2.5 text-xs font-bold text-white hover:bg-[#133352] transition cursor-pointer"
                >
                  <QrCode className="h-4 w-4 text-[#FFB300]" /> QR Code
                </button>
              </div>

              {/* Fast Social & Message Buttons */}
              <div className="mt-4 flex flex-wrap gap-2 pt-4 border-t border-white/10">
                <a
                  href={`sms:?&body=Hey!%20We%20installed%20Sunrun%20solar%20with%20a%20Tesla%20Powerwall%20and%20cut%20our%20electric%20bill%20to%20almost%20nothing.%20Check%20it%20out%20and%20get%20a%20free%20consult%20with%20our%20advisor%20Horace:%20${encodeURIComponent(referralUrl)}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#14314A] px-3 py-1.5 text-xs font-semibold text-[#82B1FF] hover:bg-[#1A3E5E] transition no-underline cursor-pointer"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Share via Text Message (SMS)
                </a>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Check out The Power Genie Sunrun solar & Tesla Powerwall: ${referralUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0F392B] px-3 py-1.5 text-xs font-semibold text-[#69F0AE] hover:bg-[#144D3A] transition no-underline cursor-pointer"
                >
                  <Share2 className="h-3.5 w-3.5" /> Share on WhatsApp
                </a>
                <a
                  href={`mailto:?subject=${encodeURIComponent("Lower your electric bill with Sunrun & Tesla Powerwall")}&body=${encodeURIComponent(`Hi,\n\nWe installed Sunrun solar and a Tesla Powerwall through The Power Genie and cut our electric bill dramatically.\n\nTake a look here: ${referralUrl}\n\nAsk for Horace Lawrence!`)}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#2D1F42] px-3 py-1.5 text-xs font-semibold text-[#D1C4E9] hover:bg-[#3D2B59] transition no-underline cursor-pointer"
                >
                  <Mail className="h-3.5 w-3.5" /> Share via Email
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

                {/* Submit Referral Button */}
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
                        {r.status === 'paid' ? (
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        )}
                        <span>{r.statusLabel}</span>
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
              <div className="rounded-2xl border border-[#1B324B] bg-gradient-to-b from-[#0C1E32] to-[#081827] p-5 shadow-lg">
                <span className="text-xs uppercase font-bold text-[#7E98B0] tracking-wider">Utility Bill Comparison</span>
                <div className="mt-4 flex items-baseline justify-between">
                  <div>
                    <span className="text-xs text-[#E57373] font-semibold">Before Solar</span>
                    <p className="m-0 text-2xl font-black text-white">$385/mo</p>
                  </div>
                  <ChevronRight className="h-6 w-6 text-[#7E98B0]" />
                  <div>
                    <span className="text-xs text-[#81C784] font-semibold">Sunrun + Powerwall</span>
                    <p className="m-0 text-2xl font-black text-[#81C784]">$18/mo</p>
                  </div>
                </div>
                <div className="mt-4 border-t border-white/10 pt-3 text-xs text-[#8BA4BD]">
                  Net Monthly Savings: <strong className="text-white">$367 / month</strong>
                </div>
              </div>

              <div className="rounded-2xl border border-[#1B324B] bg-gradient-to-b from-[#0C1E32] to-[#081827] p-5 shadow-lg">
                <span className="text-xs uppercase font-bold text-[#7E98B0] tracking-wider">Lifetime Net Savings</span>
                <p className="m-0 mt-3 text-3xl font-black text-[#FFB300]">$4,820</p>
                <p className="m-0 mt-1 text-xs text-[#8BA4BD]">Saved since system installation (14 months active).</p>
                <div className="mt-4 border-t border-white/10 pt-3 text-xs text-[#8BA4BD]">
                  25-Year Projected Savings: <strong className="text-white">$74,500+</strong>
                </div>
              </div>

              <div className="rounded-2xl border border-[#1B324B] bg-gradient-to-b from-[#0C1E32] to-[#081827] p-5 shadow-lg">
                <span className="text-xs uppercase font-bold text-[#7E98B0] tracking-wider">Environmental Offset</span>
                <p className="m-0 mt-3 text-3xl font-black text-[#64B5F6]">14.2 Tons</p>
                <p className="m-0 mt-1 text-xs text-[#8BA4BD]">CO2 greenhouse gas eliminated from utility grid.</p>
                <div className="mt-4 border-t border-white/10 pt-3 text-xs text-[#8BA4BD]">
                  Equivalent to: <strong className="text-white">328 Trees Planted</strong>
                </div>
              </div>
            </div>

            {/* Interactive 25-Year Inflation Protection Simulator */}
            <div className="rounded-2xl border border-[#1F3752] bg-[#0C1E32] p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4 mb-4">
                <div>
                  <h3 className="m-0 text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-[#4CAF50]" /> 25-Year Utility Rate Inflation Hedge
                  </h3>
                  <p className="m-0 text-xs text-[#8BA4BD] mt-0.5">
                    Electric utility rates in Texas & California have risen over 4.2% annually. Your solar rate is locked at $0.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-[#8BA4BD]">Utility Rate Inflation:</span>
                  <p className="m-0 text-xl font-bold text-[#FFB300] font-mono">{utilityInflationRate}% / yr</p>
                </div>
              </div>

              <div className="my-4">
                <input
                  type="range"
                  min="2.0"
                  max="8.0"
                  step="0.5"
                  value={utilityInflationRate}
                  onChange={(e) => setUtilityInflationRate(Number(e.target.value))}
                  className="w-full h-2 rounded-lg bg-[#18314C] accent-[#4CAF50] cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-[#5D7A96] mt-1 font-mono">
                  <span>2% (Conservative)</span>
                  <span>4.5% (Historical Average)</span>
                  <span>8% (High Grid Stress)</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
                <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                  <span className="text-[11px] uppercase font-bold text-[#8FAEC7]">5-Year Utility Cost</span>
                  <p className="m-0 text-lg font-bold text-red-400 font-mono">
                    ${Math.round(385 * 12 * 5 * (1 + utilityInflationRate / 200)).toLocaleString()}
                  </p>
                  <span className="text-[10px] text-[#81C784]">You save ~${Math.round(367 * 12 * 5).toLocaleString()}</span>
                </div>
                <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                  <span className="text-[11px] uppercase font-bold text-[#8FAEC7]">15-Year Utility Cost</span>
                  <p className="m-0 text-lg font-bold text-red-400 font-mono">
                    ${Math.round(385 * 12 * 15 * (1 + (utilityInflationRate * 1.5) / 100)).toLocaleString()}
                  </p>
                  <span className="text-[10px] text-[#81C784]">You save ~${Math.round(367 * 12 * 15).toLocaleString()}</span>
                </div>
                <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                  <span className="text-[11px] uppercase font-bold text-[#8FAEC7]">25-Year Cumulative Savings</span>
                  <p className="m-0 text-xl font-black text-[#FFB300] font-mono">
                    ${Math.round(74500 * (1 + (utilityInflationRate - 4) * 0.12)).toLocaleString()}+
                  </p>
                  <span className="text-[10px] text-[#81C784]">Guaranteed Solar Production</span>
                </div>
              </div>
            </div>

            {/* Bill Statement Record */}
            <div className="rounded-2xl border border-[#1F3752] bg-[#0C1E32] p-6 shadow-xl">
              <h3 className="m-0 text-base font-bold text-white">Solar Production Guarantee & Performance</h3>
              <p className="mt-1 text-xs text-[#8BA4BD]">
                Sunrun guarantees 100% of your estimated annual kWh solar generation or compensates you directly.
              </p>
              <div className="mt-4 rounded-xl bg-[#081827] p-4 text-xs text-[#90CAF9] flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-[#1A3859]">
                <span>System Production Target: 16,400 kWh / yr</span>
                <span className="font-bold text-[#4CAF50] flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4" /> Current Performance: 104% of Target (Exceeding)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: SUNRUN ADVISOR & WARRANTY */}
        {/* ========================================================================= */}
        {activeTab === 'concierge' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#1B324B] bg-gradient-to-br from-[#0C1E32] via-[#091D30] to-[#081726] p-6 sm:p-8 shadow-xl">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FF6B00]/20 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-[#FF8A2B]">
                    <Sparkles className="h-3.5 w-3.5 text-[#FF8A2B]" /> Dedicated Sunrun Solar Expert
                  </span>
                  <h2 className="m-0 mt-2 text-2xl sm:text-3xl font-black text-white">Horace Lawrence</h2>
                  <p className="m-0 mt-0.5 text-sm text-[#8BA4BD]">The Block Sales Expert Team Lead · Sunrun Solar Advisor</p>

                  <div className="mt-4 flex flex-wrap gap-4 text-sm">
                    <a href="tel:+15102417007" className="inline-flex items-center gap-2 text-white font-semibold hover:underline">
                      <Phone className="h-4 w-4 text-[#FF6B00]" /> 510-241-7007
                    </a>
                    <a href="mailto:horace.lawrence@sunrun.com" className="inline-flex items-center gap-2 text-white font-semibold hover:underline">
                      <Mail className="h-4 w-4 text-[#FF6B00]" /> horace.lawrence@sunrun.com
                    </a>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 w-full md:w-auto">
                  <a
                    href="/book"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65100] px-5 py-3 text-sm font-bold text-white hover:brightness-110 transition no-underline shadow-lg shadow-[#FF6B00]/25"
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
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#4CAF50]" /> 100% Production Guarantee with annual cash true-up credits.
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
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#FFB300]" /> 18.5 kW Motor Starting LRA support for whole-home central A/C.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
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
              className="mt-5 w-full rounded-xl bg-[#1C3A5A] py-2.5 text-xs font-bold text-white hover:bg-[#28507B] transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
