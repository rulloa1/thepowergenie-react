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
  BarChart3,
  LineChart,
  TrendingDown,
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
  FileText,
  Download,
  Eye,
  RefreshCw,
  Cpu,
  Layers,
  Lock,
  Unlock,
  Compass,
  Gauge,
  Radio,
  Power
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

interface MilestoneStage {
  id: number;
  name: string;
  shortName: string;
  status: 'completed' | 'active' | 'pending';
  date: string;
  duration: string;
  signOffLead: string;
  role: string;
  details: string;
  deliverables: string[];
  documentId: string;
  documentTitle: string;
  documentSummary: string;
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

const SUNRUN_MILESTONES: MilestoneStage[] = [
  {
    id: 1,
    name: 'Agreement Executed & Locked',
    shortName: 'Agreement Signed',
    status: 'completed',
    date: 'Oct 2, 2026',
    duration: 'Day 1',
    signOffLead: 'Horace Lawrence',
    role: 'Sunrun Senior Energy Advisor & Team Lead',
    details: 'Digital contract executed via DocuSign. Custom Solar PPA + Tesla Powerwall 3 battery storage package locked in at $0 upfront. Sunrun 25-Year Production Guarantee and comprehensive equipment warranty activated.',
    deliverables: [
      'Executed Sunrun Solar & Battery Master Agreement',
      '25-Year Production Guarantee Contract (16,400 kWh/yr)',
      'Customer Care Welcome Package & Portal Access',
    ],
    documentId: 'DOC-AGR-7721',
    documentTitle: 'Executed Master Solar & Powerwall PPA Agreement',
    documentSummary: 'Binding 25-year energy performance agreement protecting your household from utility rate increases.',
  },
  {
    id: 2,
    name: 'Site Survey & 3D LiDAR Drone Scan',
    shortName: 'Site Survey & LiDAR',
    status: 'completed',
    date: 'Oct 6, 2026',
    duration: 'Day 4',
    signOffLead: 'Marcus Vance',
    role: 'Lead Field Systems Surveyor',
    details: 'Certified field surveyor completed sub-centimeter roof drone LiDAR scan, digital shading analysis, attic truss structural integrity inspection, and 200A electrical service panel load verification for whole-home battery backup.',
    deliverables: [
      '3D Aerial LiDAR Drone Point Cloud & Roof Geometry',
      '200A Electrical Service Panel Busbar Load Calculation',
      'Attic Rafter & Structural Load Engineering Report',
    ],
    documentId: 'DOC-SRV-4109',
    documentTitle: '3D LiDAR Survey & Structural Engineering Report',
    documentSummary: 'Precision engineering verification certifying structural roof framing and electrical service capacity.',
  },
  {
    id: 3,
    name: 'AHJ Permitting & Engineering Approved',
    shortName: 'Permitting Approved',
    status: 'completed',
    date: 'Oct 14, 2026',
    duration: 'Day 12',
    signOffLead: 'Elena Rostova, PE',
    role: 'Licensed Professional Electrical Engineer',
    details: 'City Building & Safety Department issued municipal solar and energy storage permits. Professional Engineer (PE) stamped blueprints approved for 28 REC Alpha panels, 2x Tesla Powerwall 3 units, and Tesla Backup Gateway 2 rapid shutdown system.',
    deliverables: [
      'City Building & Electrical Department Construction Permit #SLR-2026-8819',
      'PE Stamped Single-Line Electrical Schematic',
      'Tesla Backup Gateway 2 Rapid Shutdown & Islanding Plan',
    ],
    documentId: 'DOC-PMT-8819',
    documentTitle: 'City Building & Electrical Department Approved Permit',
    documentSummary: 'Official municipal construction authorization and stamped PE electrical engineering blueprints.',
  },
  {
    id: 4,
    name: 'Installation Day — Panels & Powerwall 3',
    shortName: 'Installation Day',
    status: 'completed',
    date: 'Oct 20, 2026',
    duration: 'Day 18',
    signOffLead: 'Carlos Mendez',
    role: 'Sunrun Master Electrician Crew Lead',
    details: 'Certified master electrician installation crew mounted 28 REC Alpha Pure-R 455W all-black solar panels (12.8 kW DC), installed twin Tesla Powerwall 3 units with liquid cooling loops, and integrated the Tesla Backup Gateway 2 microgrid controller.',
    deliverables: [
      '28x REC Alpha Pure-R 455W High-Efficiency Modules Mounted',
      '2x Tesla Powerwall 3 Batteries (27.0 kWh, 11.5 kW Continuous)',
      'Tesla Backup Gateway 2 Whole-Home Microgrid Isolation Contactor',
    ],
    documentId: 'DOC-INS-9024',
    documentTitle: 'Installation Quality & Electrical Commissioning Certificate',
    documentSummary: 'Signed electrical commissioning record verifying flashing seals, torque specs, and rapid shutdown compliance.',
  },
  {
    id: 5,
    name: 'Municipal & City Inspection Passed',
    shortName: 'Inspection Passed',
    status: 'completed',
    date: 'Oct 24, 2026',
    duration: 'Day 22',
    signOffLead: 'Inspector R. Gallagher (City Inspector #412)',
    role: 'City Building & Electrical Division',
    details: 'City Electrical Building Inspector performed full on-site code verification. Confirmed compliance with NEC 690.12 (Rapid Shutdown), grounding electrode bonding, UL 9540 fire safety spacing, and simulated 8ms microgrid islanding. Green inspection tag signed.',
    deliverables: [
      'Municipal Electrical Inspection Green Tag Signed & Affixed',
      'NEC 690.12 & UL 9540 Fire Safety Compliance Certificate',
      'Microgrid Contactor 8ms Sub-Cycle Islanding Field Test Pass',
    ],
    documentId: 'DOC-TAG-4120',
    documentTitle: 'Municipal Final Inspection Sign-Off & Green Tag Certificate',
    documentSummary: 'Official municipal green tag certifying complete compliance with all local and national electrical safety codes.',
  },
  {
    id: 6,
    name: 'Permission to Operate (PTO) Granted',
    shortName: 'Permission to Operate (PTO)',
    status: 'completed',
    date: 'Oct 28, 2026',
    duration: 'Day 26',
    signOffLead: 'Interconnection Affairs Desk',
    role: 'Electric Utility Interconnection Operations',
    details: 'Electric Utility issued the official Permission to Operate (PTO) authorization letter. Smart meter programmed for bi-directional Net Energy Metering (NEM 3.0), permitting lawful export of clean solar energy to the grid.',
    deliverables: [
      'Official Utility Permission to Operate (PTO) Authorization Letter',
      'Bi-Directional Smart Utility Meter Interconnection Agreement',
      'Net Energy Metering (NEM 3.0) Export Billing Rate Activated',
    ],
    documentId: 'DOC-PTO-1049',
    documentTitle: 'Official Utility Permission to Operate (PTO) Letter',
    documentSummary: 'Formal utility authorization permitting your solar and Tesla battery system to energize and export power.',
  },
  {
    id: 7,
    name: 'System Energized & Live Telemetry',
    shortName: 'System Energized',
    status: 'active',
    date: 'Oct 29, 2026 (Live)',
    duration: 'Day 27 (Continuous)',
    signOffLead: 'Horace Lawrence & Sunrun Operations',
    role: 'Sunrun System Commissioning & VIP Support',
    details: 'Solar panels and dual Tesla Powerwall 3 fully energized and synchronized! Microgrid firewall actively protecting household loads. Live telemetry streaming to Tesla App and mySunrun portal with 24/7 automated monitoring and 100% production guarantee.',
    deliverables: [
      'Live High-Speed Telemetry Streaming to Tesla Gateway & Portal',
      'Sunrun 24/7 Automated Satellite & Inverter Performance Monitoring',
      'Lifetime VIP Concierge Direct Contact: Horace Lawrence (510-241-7007)',
    ],
    documentId: 'DOC-ENG-2026',
    documentTitle: 'System Energization & Active Warranty Certificate',
    documentSummary: 'Live system energization certificate confirming active microgrid protection and 24/7 proactive monitoring.',
  },
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

  const [activeTab, setActiveTab] = useState<'powerwall' | 'milestones' | 'referrals' | 'savings' | 'concierge'>('powerwall');

  useEffect(() => {
    if (activeTab === 'referrals') {
      trackInfoPageVisit('/homeowner Referral Submission Form');
    }
  }, [activeTab]);

  // Tesla Powerwall / Energy Firewall state
  const [operationMode, setOperationMode] = useState<'self_consumption' | 'autonomous' | 'backup'>('self_consumption');
  const [isStormWatchActive, setIsStormWatchActive] = useState<boolean>(false);
  const [isOutageSimulated, setIsOutageSimulated] = useState<boolean>(false);
  const [historyData, setHistoryData] = useState<any>(null);
  const [selectedHistoryHour, setSelectedHistoryHour] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/tesla/history')
      .then(res => res.json())
      .then(data => {
        setHistoryData(data);
        if (data && data.points && data.points.length > 13) {
          setSelectedHistoryHour(13);
        }
      })
      .catch(() => {});
  }, []);
  const [backupReserve, setBackupReserve] = useState<number>(25);
  const [batteryPct, setBatteryPct] = useState<number>(88);
  const batteryCapacity = 27.0; // Dual Powerwall 3 (13.5 kWh * 2)

  // Interactive node inspection in the 4-node ring
  const [inspectedNode, setInspectedNode] = useState<'solar' | 'home' | 'battery' | 'grid' | null>(null);

  // Interactive appliance loads during blackout
  const [activeApplianceIds, setActiveApplianceIds] = useState<string[]>([
    'fridge',
    'wifi',
    'lights',
    'ac',
  ]);

  // Milestone Document Modal
  const [selectedMilestoneDoc, setSelectedMilestoneDoc] = useState<MilestoneStage | null>(null);

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
    if (!showQrModal && !selectedMilestoneDoc) return;
    return lockPageScroll();
  }, [showQrModal, selectedMilestoneDoc]);

  // Handle URL hash routing
  useEffect(() => {
    const hash = window.location.hash.toLowerCase();
    if (hash.includes('milestone') || hash.includes('pto')) setActiveTab('milestones');
    else if (hash.includes('referral')) setActiveTab('referrals');
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

  const handleSelectAllAppliances = () => {
    setActiveApplianceIds(DEFAULT_APPLIANCES.map((a) => a.id));
  };

  const handleSelectEssentialOnly = () => {
    setActiveApplianceIds(DEFAULT_APPLIANCES.filter((a) => a.essential).map((a) => a.id));
  };

  const handleClearAppliances = () => {
    setActiveApplianceIds([]);
  };

  // Compute live active load
  const applianceLoadKw = activeApplianceIds.reduce((sum, id) => {
    const app = DEFAULT_APPLIANCES.find((a) => a.id === id);
    return sum + (app ? app.kw : 0);
  }, 0);

  const solarGenerationKw = isOutageSimulated ? 6.2 : 8.4;
  const homeLoadKw = Number((0.6 + applianceLoadKw).toFixed(2));
  const currentBatteryKwh = (batteryCapacity * batteryPct) / 100;
  const maxInverterContinuousKw = 11.5;
  const loadPercentageOfInverter = Math.min(100, Math.round((homeLoadKw / maxInverterContinuousKw) * 100));

  // Tesla Power Flow Physics Calculations:
  const solarToHomeKw = Number(Math.min(solarGenerationKw, homeLoadKw).toFixed(2));
  const excessSolarKw = Number(Math.max(0, solarGenerationKw - homeLoadKw).toFixed(2));
  const homeDeficitKw = Number(Math.max(0, homeLoadKw - solarGenerationKw).toFixed(2));

  let solarToBatteryKw = 0;
  let solarToGridKw = 0;
  let batteryToHomeKw = 0;
  let gridToHomeKw = 0;
  let gridToBatteryKw = 0;
  let batteryFlowKw = 0; // Positive = discharging, Negative = charging

  if (isOutageSimulated) {
    // Grid Contactor Open (8ms microgrid isolation)
    if (solarGenerationKw >= homeLoadKw) {
      solarToBatteryKw = excessSolarKw;
      batteryFlowKw = -excessSolarKw; // Charging
    } else {
      batteryToHomeKw = homeDeficitKw;
      batteryFlowKw = homeDeficitKw; // Discharging to cover home load
    }
  } else if (isStormWatchActive) {
    // Storm Watch: Pre-charging Powerwall to 100% reserve from solar & grid
    solarToBatteryKw = excessSolarKw;
    const chargeDeficit = Number(Math.max(0, 5.0 - solarToBatteryKw).toFixed(2));
    gridToBatteryKw = chargeDeficit;
    batteryFlowKw = -(solarToBatteryKw + gridToBatteryKw);
    if (homeDeficitKw > 0) {
      gridToHomeKw = homeDeficitKw;
    }
  } else if (operationMode === 'backup') {
    // 100% backup reserve: battery does not discharge, excess solar goes to grid
    solarToGridKw = excessSolarKw;
    gridToHomeKw = homeDeficitKw;
    batteryFlowKw = 0;
  } else if (operationMode === 'autonomous') {
    // Time-based control (peak rate discharge simulation):
    batteryToHomeKw = Number(Math.min(homeLoadKw, 5.0).toFixed(2));
    batteryFlowKw = batteryToHomeKw;
    solarToGridKw = excessSolarKw;
    if (homeDeficitKw > batteryToHomeKw) {
      gridToHomeKw = Number((homeDeficitKw - batteryToHomeKw).toFixed(2));
    }
  } else {
    // self_consumption (Default):
    if (solarGenerationKw >= homeLoadKw) {
      const chargeHeadroom = batteryCapacity * (1 - batteryPct / 100);
      const possibleCharge = Math.min(excessSolarKw, 5.0, chargeHeadroom > 0 ? 5.0 : 0);
      solarToBatteryKw = Number(possibleCharge.toFixed(2));
      solarToGridKw = Number((excessSolarKw - solarToBatteryKw).toFixed(2));
      batteryFlowKw = -solarToBatteryKw;
    } else {
      if (batteryPct > backupReserve) {
        batteryToHomeKw = homeDeficitKw;
        batteryFlowKw = homeDeficitKw;
      } else {
        gridToHomeKw = homeDeficitKw;
        batteryFlowKw = 0;
      }
    }
  }

  const gridFlowKw = isOutageSimulated
    ? 0
    : Number((gridToHomeKw + gridToBatteryKw - solarToGridKw).toFixed(2));

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

  return (
    <div className="min-h-screen bg-[#07131F] text-[#F3F7FA] font-sans antialiased selection:bg-[#FF6B00]/30 selection:text-white">
      {/* Inline styles for Tesla animated energy conduit flow */}
      <style>{`
        @keyframes teslaFlowForward {
          from { stroke-dashoffset: 32; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes teslaFlowReverse {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: 32; }
        }
        .flow-solar-home {
          animation: teslaFlowForward 1.2s linear infinite;
        }
        .flow-solar-battery {
          animation: teslaFlowForward 1.0s linear infinite;
        }
        .flow-solar-grid {
          animation: teslaFlowForward 1.4s linear infinite;
        }
        .flow-battery-home {
          animation: teslaFlowForward 1.1s linear infinite;
        }
        .flow-grid-home {
          animation: teslaFlowForward 1.3s linear infinite;
        }
        .flow-grid-battery {
          animation: teslaFlowForward 1.0s linear infinite;
        }
      `}</style>

      {/* Top Banner Navigation */}
      <header className="sticky top-0 z-50 border-b border-[#1E2E42] bg-[#0A1828]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <a href="/" className="inline-flex items-center gap-2 text-white no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] rounded-lg">
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
              className="inline-flex items-center gap-2 rounded-full border border-[#234567] bg-[#0E253B] px-3.5 py-1.5 text-xs font-semibold text-[#90CAF9] hover:bg-[#143452] hover:border-[#3A6B9B] transition shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
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
                    <ShieldCheck className="h-3.5 w-3.5 text-[#4CAF50]" /> Tesla Energy Gateway Online · Sunrun Verified
                  </>
                )}
              </p>
            </div>
            <h1 className="m-0 mt-1.5 text-2xl sm:text-3xl font-black tracking-tight text-white">
              Homeowner Portal & Tesla Firewall
            </h1>
            <p className="m-0 mt-1 text-sm text-[#8EA3B8]">
              Dual Tesla Powerwall 3 (27.0 kWh) · 12.8 kW Solar System · Oakland Hills Estate
            </p>
          </div>

          {/* Quick Action Badges */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setActiveTab('milestones')}
              className="inline-flex items-center gap-2 rounded-xl border border-[#1F4A38] bg-[#0B261D] px-3.5 py-2.5 text-sm font-semibold text-[#81C784] hover:bg-[#11382A] hover:border-[#2F6B52] transition cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50]"
            >
              <CheckCircle2 className="h-4 w-4 text-[#4CAF50]" /> mySunrun PTO (100%)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('referrals')}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65100] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#FF6B00]/25 hover:brightness-110 transition active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
            >
              <DollarSign className="h-4 w-4" /> Refer & Earn $1,000 Cash
            </button>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="border-b border-[#182C44] bg-[#091A2C]">
        <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-2 sm:px-6 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'powerwall'}
            onClick={() => setActiveTab('powerwall')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50] ${
              activeTab === 'powerwall'
                ? 'bg-[#123120] text-[#81C784] border border-[#2E7D32] shadow-sm shadow-[#4CAF50]/20'
                : 'text-[#8EAEC7] hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <Battery className={`h-4 w-4 ${activeTab === 'powerwall' ? 'text-[#4CAF50]' : 'text-[#8EAEC7]'}`} />
            <span>Tesla Powerwall & Energy Ring</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'milestones'}
            onClick={() => setActiveTab('milestones')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2196F3] ${
              activeTab === 'milestones'
                ? 'bg-[#0E2841] text-[#64B5F6] border border-[#1E88E5]/70 shadow-sm shadow-[#2196F3]/20'
                : 'text-[#8EAEC7] hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <CheckCircle className={`h-4 w-4 ${activeTab === 'milestones' ? 'text-[#64B5F6]' : 'text-[#8EAEC7]'}`} />
            <span>mySunrun 7-Stage PTO Stepper</span>
            <span className="rounded-full bg-[#10B981] px-2 py-0.5 text-[10px] font-black text-white">
              100% PTO
            </span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'referrals'}
            onClick={() => setActiveTab('referrals')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] ${
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
            role="tab"
            aria-selected={activeTab === 'savings'}
            onClick={() => setActiveTab('savings')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2196F3] ${
              activeTab === 'savings'
                ? 'bg-[#0F2942] text-[#64B5F6] border border-[#1E88E5]/70 shadow-sm shadow-[#2196F3]/20'
                : 'text-[#8EAEC7] hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <TrendingUp className={`h-4 w-4 ${activeTab === 'savings' ? 'text-[#2196F3]' : 'text-[#8EAEC7]'}`} />
            <span>Bill Savings & Performance</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'concierge'}
            onClick={() => setActiveTab('concierge')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB300] ${
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
        {/* TAB 1: TESLA POWERWALL & ANIMATED 4-NODE ENERGY RING */}
        {/* ========================================================================= */}
        {activeTab === 'powerwall' && (
          <div className="space-y-6 animate-fade-in">
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
                        Tesla Microgrid Island Mode Engaged — Grid Contactor Open (8ms Reaction)
                      </h3>
                      <p className="m-0 text-xs sm:text-sm text-[#FFD0AD] mt-0.5">
                        The Tesla Backup Gateway has completely isolated your home from the utility grid. Your active appliances ({activeApplianceIds.length} connected, {homeLoadKw} kW) are seamlessly powered by your Dual Powerwall 3.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOutageSimulated(false)}
                    className="shrink-0 rounded-xl bg-[#4CAF50] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow hover:bg-[#43A047] transition cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50]"
                  >
                    Restore Utility Grid
                  </button>
                </div>
              </div>
            ) : null}

            {/* Storm Watch Alert / Banner */}
            {isStormWatchActive && !isOutageSimulated ? (
              <div className="rounded-2xl border-2 border-sky-500 bg-gradient-to-r from-sky-500/15 via-blue-950/40 to-[#0A1828] p-5 text-white shadow-xl shadow-sky-500/15 animate-fade-in">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-500/25 text-sky-400 shadow-inner">
                      <CloudLightning className="h-6 w-6" />
                    </span>
                    <div>
                      <h3 className="m-0 text-base font-bold text-sky-300">
                        Tesla Storm Watch Active — National Weather Service Severe Storm Alert
                      </h3>
                      <p className="m-0 text-xs sm:text-sm text-sky-100 mt-0.5">
                        Severe weather alert detected in your area. Powerwall is automatically charging to 100% capacity from solar and grid, holding full reserve for emergency backup.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsStormWatchActive(false)}
                    className="shrink-0 rounded-xl border border-sky-400/40 bg-sky-950/60 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-sky-200 hover:bg-sky-900 transition cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  >
                    Dismiss Storm Watch
                  </button>
                </div>
              </div>
            ) : null}

            {/* Tesla Operating Mode Pills */}
            <div className="rounded-2xl border border-[#1E324A] bg-[#0A1828] p-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[#8FAEC7] flex items-center gap-1.5">
                  <Sliders className="h-3.5 w-3.5 text-[#4CAF50]" /> Tesla Energy Operating Mode
                </span>
                <span className="text-xs text-[#607D8B] font-mono">Gateway ID: TEG-GW3-982410</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => { setOperationMode('self_consumption'); setIsStormWatchActive(false); }}
                  className={`rounded-xl p-3.5 border text-left transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50] ${
                    operationMode === 'self_consumption' && !isStormWatchActive
                      ? 'border-[#4CAF50] bg-[#102C1E] text-white shadow-md shadow-[#4CAF50]/20'
                      : 'border-[#1B3047] bg-[#081726] text-[#8FAEC7] hover:border-[#2C4F75] hover:bg-[#0C1E30]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Sparkles className={`h-5 w-5 shrink-0 ${operationMode === 'self_consumption' && !isStormWatchActive ? 'text-[#4CAF50]' : 'text-[#607D8B]'}`} />
                    <div>
                      <strong className="text-xs sm:text-sm font-bold block text-white">Self-Powered</strong>
                      <span className="text-[11px] text-[#8BA4BD] block">Maximize solar & battery self-reliance</span>
                    </div>
                  </div>
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${operationMode === 'self_consumption' && !isStormWatchActive ? 'bg-[#4CAF50] shadow-sm shadow-[#4CAF50]' : 'bg-[#2A435E]'}`} />
                </button>

                <button
                  type="button"
                  onClick={() => { setOperationMode('autonomous'); setIsStormWatchActive(false); }}
                  className={`rounded-xl p-3.5 border text-left transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2196F3] ${
                    operationMode === 'autonomous' && !isStormWatchActive
                      ? 'border-[#2196F3] bg-[#0F2A42] text-white shadow-md shadow-[#2196F3]/20'
                      : 'border-[#1B3047] bg-[#081726] text-[#8FAEC7] hover:border-[#2C4F75] hover:bg-[#0C1E30]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <TrendingUp className={`h-5 w-5 shrink-0 ${operationMode === 'autonomous' && !isStormWatchActive ? 'text-[#2196F3]' : 'text-[#607D8B]'}`} />
                    <div>
                      <strong className="text-xs sm:text-sm font-bold block text-white">Time-Based Control</strong>
                      <span className="text-[11px] text-[#8BA4BD] block">Discharge during peak utility rates (4–9 PM)</span>
                    </div>
                  </div>
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${operationMode === 'autonomous' && !isStormWatchActive ? 'bg-[#2196F3] shadow-sm shadow-[#2196F3]' : 'bg-[#2A435E]'}`} />
                </button>

                <button
                  type="button"
                  onClick={() => { setOperationMode('backup'); setIsStormWatchActive(false); }}
                  className={`rounded-xl p-3.5 border text-left transition-all duration-200 cursor-pointer flex items-center justify-between gap-3 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9800] ${
                    operationMode === 'backup' && !isStormWatchActive
                      ? 'border-[#FF9800] bg-[#331C08] text-white shadow-md shadow-[#FF9800]/20'
                      : 'border-[#1B3047] bg-[#081726] text-[#8FAEC7] hover:border-[#2C4F75] hover:bg-[#0C1E30]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Shield className={`h-5 w-5 shrink-0 ${operationMode === 'backup' && !isStormWatchActive ? 'text-[#FF9800]' : 'text-[#607D8B]'}`} />
                    <div>
                      <strong className="text-xs sm:text-sm font-bold block text-white">Backup-Only</strong>
                      <span className="text-[11px] text-[#8BA4BD] block">Maintain 100% battery reserve for emergencies</span>
                    </div>
                  </div>
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${operationMode === 'backup' && !isStormWatchActive ? 'bg-[#FF9800] shadow-sm shadow-[#FF9800]' : 'bg-[#2A435E]'}`} />
                </button>
              </div>
            </div>

            {/* Core Telemetry Grid: Animated Vector Flow Ring & Live Status */}
            <div className="grid gap-6 lg:grid-cols-12 items-start">
              {/* Left/Center Column: The Iconic Animated Tesla 4-Node Flow Vector Ring */}
              <div className="rounded-2xl border border-[#1B324B] bg-gradient-to-b from-[#0B1A2A] via-[#081522] to-[#050D15] p-6 shadow-2xl lg:col-span-7 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="w-full flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${isOutageSimulated ? 'bg-[#FF6B00] animate-ping' : 'bg-[#4CAF50] animate-pulse'}`} />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#A0C0DC]">
                      {isOutageSimulated ? 'Microgrid Island Mode (Active)' : 'Tesla Real-Time Power Flow'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[#132C45] px-2.5 py-0.5 text-[11px] font-mono text-[#81C784]">
                      {isOutageSimulated ? '60.00 Hz (Inverter Master)' : 'Grid Sync 60.00 Hz'}
                    </span>
                  </div>
                </div>

                {/* SVG Vector Power Flow Diagram */}
                <div className="relative w-full max-w-[390px] aspect-square flex items-center justify-center my-2">
                  <svg className="w-full h-full" viewBox="0 0 380 380">
                    <defs>
                      <filter id="teslaGlow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="5" result="coloredBlur" />
                        <feMerge>
                          <feMergeNode in="coloredBlur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                      <radialGradient id="solarGlowGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#FFB300" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#FFB300" stopOpacity="0" />
                      </radialGradient>
                      <radialGradient id="homeGlowGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
                      </radialGradient>
                      <radialGradient id="batteryGlowGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                      </radialGradient>
                    </defs>

                    {/* Muted Circular Track Ring */}
                    <circle cx="190" cy="190" r="120" stroke="#16283C" strokeWidth="6" fill="none" />

                    {/* Crosshair Axis Lines */}
                    <line x1="190" y1="70" x2="190" y2="310" stroke="#16283C" strokeWidth="6" strokeLinecap="round" />
                    <line x1="70" y1="190" x2="310" y2="190" stroke="#16283C" strokeWidth="6" strokeLinecap="round" />

                    {/* ============================================================== */}
                    {/* ACTIVE FLOW CONDUITS (DIRECTIONAL ANIMATED PARTICLES) */}
                    {/* ============================================================== */}

                    {/* 1. Solar -> Home (Top to Right Arc) */}
                    {solarToHomeKw > 0 && (
                      <path
                        d="M 190 70 A 120 120 0 0 1 310 190"
                        fill="none"
                        stroke="#FFB300"
                        strokeWidth="5"
                        strokeDasharray="6 10"
                        strokeLinecap="round"
                        filter="url(#teslaGlow)"
                        className="flow-solar-home"
                      />
                    )}

                    {/* 2. Solar -> Powerwall (Vertical Down Line - Luminous Solar Gold!) */}
                    {solarToBatteryKw > 0 && (
                      <line
                        x1="190"
                        y1="70"
                        x2="190"
                        y2="310"
                        stroke="#FFB300"
                        strokeWidth="5"
                        strokeDasharray="6 10"
                        strokeLinecap="round"
                        filter="url(#teslaGlow)"
                        className="flow-solar-battery"
                      />
                    )}

                    {/* 3. Solar -> Grid (Top to Left Arc - Clean Export) */}
                    {solarToGridKw > 0 && !isOutageSimulated && (
                      <path
                        d="M 190 70 A 120 120 0 0 0 70 190"
                        fill="none"
                        stroke="#10B981"
                        strokeWidth="5"
                        strokeDasharray="6 10"
                        strokeLinecap="round"
                        filter="url(#teslaGlow)"
                        className="flow-solar-grid"
                      />
                    )}

                    {/* 4. Powerwall -> Home (Bottom to Right Arc - Battery Discharging) */}
                    {batteryToHomeKw > 0 && (
                      <path
                        d="M 190 310 A 120 120 0 0 0 310 190"
                        fill="none"
                        stroke={isOutageSimulated ? '#FF8A2B' : '#10B981'}
                        strokeWidth="5"
                        strokeDasharray="6 10"
                        strokeLinecap="round"
                        filter="url(#teslaGlow)"
                        className="flow-battery-home"
                      />
                    )}

                    {/* 5. Grid -> Home (Horizontal Left to Right Line - Grid Import) */}
                    {gridToHomeKw > 0 && !isOutageSimulated && (
                      <line
                        x1="70"
                        y1="190"
                        x2="310"
                        y2="190"
                        stroke="#38BDF8"
                        strokeWidth="5"
                        strokeDasharray="6 10"
                        strokeLinecap="round"
                        filter="url(#teslaGlow)"
                        className="flow-grid-home"
                      />
                    )}

                    {/* 6. Grid -> Powerwall (Left to Bottom Arc - Storm Watch Precharge) */}
                    {gridToBatteryKw > 0 && !isOutageSimulated && (
                      <path
                        d="M 70 190 A 120 120 0 0 0 190 310"
                        fill="none"
                        stroke="#38BDF8"
                        strokeWidth="5"
                        strokeDasharray="6 10"
                        strokeLinecap="round"
                        filter="url(#teslaGlow)"
                        className="flow-grid-battery"
                      />
                    )}

                    {/* Center Core Gateway Hub */}
                    <circle cx="190" cy="190" r="32" fill="#06121E" stroke="#1B3650" strokeWidth="2" />
                    <text x="190" y="186" textAnchor="middle" fill="#8FAEC7" fontSize="9" fontWeight="bold" fontFamily="system-ui">
                      {isOutageSimulated ? 'ISLANDED' : 'GATEWAY'}
                    </text>
                    <text x="190" y="200" textAnchor="middle" fill={isOutageSimulated ? '#FF8A2B' : '#4CAF50'} fontSize="10" fontWeight="black" fontFamily="system-ui">
                      {isOutageSimulated ? '8ms OPEN' : 'TEG-GW3'}
                    </text>

                    {/* ============================================================== */}
                    {/* 4 PRIMARY NODES: SOLAR (TOP), GRID (LEFT), POWERWALL (BOTTOM), HOME (RIGHT) */}
                    {/* ============================================================== */}

                    {/* NODE 1: SOLAR (TOP: 190, 70) */}
                    <g
                      transform="translate(190, 70)"
                      className="cursor-pointer transition-transform duration-200 hover:scale-105"
                      onClick={() => setInspectedNode(inspectedNode === 'solar' ? null : 'solar')}
                    >
                      <circle cx="0" cy="0" r="42" fill="url(#solarGlowGrad)" />
                      <circle cx="0" cy="0" r="34" fill="#0A1828" stroke="#F59E0B" strokeWidth={inspectedNode === 'solar' ? '4' : '3'} filter="url(#teslaGlow)" />
                      <circle cx="0" cy="0" r="29" fill="#141E10" />
                      <Sun x="-11" y="-23" width="22" height="22" className="text-amber-400" />
                      <text x="0" y="9" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold" fontFamily="monospace">
                        {solarGenerationKw.toFixed(1)} kW
                      </text>
                      <text x="0" y="21" textAnchor="middle" fill="#FBBF24" fontSize="8" fontWeight="bold" fontFamily="system-ui">
                        SOLAR
                      </text>
                    </g>

                    {/* NODE 2: HOME (RIGHT: 310, 190) */}
                    <g
                      transform="translate(310, 190)"
                      className="cursor-pointer transition-transform duration-200 hover:scale-105"
                      onClick={() => setInspectedNode(inspectedNode === 'home' ? null : 'home')}
                    >
                      <circle cx="0" cy="0" r="42" fill="url(#homeGlowGrad)" />
                      <circle cx="0" cy="0" r="34" fill="#0A1828" stroke="#38BDF8" strokeWidth={inspectedNode === 'home' ? '4' : '3'} filter="url(#teslaGlow)" />
                      <circle cx="0" cy="0" r="29" fill="#0A1E30" />
                      <HomeIcon x="-11" y="-23" width="22" height="22" className="text-sky-400" />
                      <text x="0" y="9" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold" fontFamily="monospace">
                        {homeLoadKw.toFixed(1)} kW
                      </text>
                      <text x="0" y="21" textAnchor="middle" fill="#7DD3FC" fontSize="8" fontWeight="bold" fontFamily="system-ui">
                        HOME
                      </text>
                    </g>

                    {/* NODE 3: POWERWALL 3 (BOTTOM: 190, 310) */}
                    <g
                      transform="translate(190, 310)"
                      className="cursor-pointer transition-transform duration-200 hover:scale-105"
                      onClick={() => setInspectedNode(inspectedNode === 'battery' ? null : 'battery')}
                    >
                      <circle cx="0" cy="0" r="42" fill="url(#batteryGlowGrad)" />
                      <circle
                        cx="0"
                        cy="0"
                        r="34"
                        fill="#0A1828"
                        stroke={batteryFlowKw > 0 ? '#FF8A2B' : '#10B981'}
                        strokeWidth={inspectedNode === 'battery' ? '4' : '3'}
                        filter="url(#teslaGlow)"
                      />
                      <circle cx="0" cy="0" r="29" fill="#0B2317" />
                      <Battery x="-11" y="-23" width="22" height="22" className={batteryFlowKw > 0 ? 'text-[#FF8A2B]' : 'text-emerald-400'} />
                      <text x="0" y="9" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold" fontFamily="monospace">
                        {batteryPct}%
                      </text>
                      <text x="0" y="21" textAnchor="middle" fill={batteryFlowKw > 0 ? '#FFA040' : '#81C784'} fontSize="8" fontWeight="bold" fontFamily="system-ui">
                        {batteryFlowKw > 0 ? `-${batteryFlowKw.toFixed(1)} kW` : batteryFlowKw < 0 ? `+${Math.abs(batteryFlowKw).toFixed(1)} kW` : 'STANDBY'}
                      </text>
                    </g>

                    {/* NODE 4: GRID (LEFT: 70, 190) */}
                    <g
                      transform="translate(70, 190)"
                      className="cursor-pointer transition-transform duration-200 hover:scale-105"
                      onClick={() => setInspectedNode(inspectedNode === 'grid' ? null : 'grid')}
                    >
                      <circle
                        cx="0"
                        cy="0"
                        r="34"
                        fill="#0A1828"
                        stroke={isOutageSimulated ? '#EF4444' : gridFlowKw < 0 ? '#10B981' : '#38BDF8'}
                        strokeWidth={inspectedNode === 'grid' ? '4' : '3'}
                        filter="url(#teslaGlow)"
                      />
                      <circle cx="0" cy="0" r="29" fill={isOutageSimulated ? '#2B0E0E' : '#0B1C2A'} />
                      <Zap x="-11" y="-23" width="22" height="22" className={isOutageSimulated ? 'text-red-400' : gridFlowKw < 0 ? 'text-emerald-400' : 'text-sky-400'} />
                      <text x="0" y="9" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="bold" fontFamily="monospace">
                        {isOutageSimulated ? '0.0 kW' : `${Math.abs(gridFlowKw).toFixed(1)} kW`}
                      </text>
                      <text x="0" y="21" textAnchor="middle" fill={isOutageSimulated ? '#F87171' : gridFlowKw < 0 ? '#81C784' : '#7DD3FC'} fontSize="8" fontWeight="bold" fontFamily="system-ui">
                        {isOutageSimulated ? 'ISLAND' : gridFlowKw < 0 ? 'EXPORT' : 'IMPORT'}
                      </text>
                    </g>
                  </svg>
                </div>

                {/* Sub-Ring Telemetry Legend */}
                <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/10 text-center text-xs">
                  <button
                    type="button"
                    onClick={() => setInspectedNode(inspectedNode === 'solar' ? null : 'solar')}
                    className={`rounded-xl p-2.5 border transition cursor-pointer text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                      inspectedNode === 'solar' ? 'bg-[#211A0B] border-amber-400' : 'bg-[#081726] border-[#18314C] hover:border-amber-400/50'
                    }`}
                  >
                    <span className="text-[10px] text-amber-400 uppercase font-bold block">Solar Roof</span>
                    <strong className="text-white font-mono text-sm">{solarGenerationKw} kW</strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectedNode(inspectedNode === 'home' ? null : 'home')}
                    className={`rounded-xl p-2.5 border transition cursor-pointer text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                      inspectedNode === 'home' ? 'bg-[#0B1E2E] border-sky-400' : 'bg-[#081726] border-[#18314C] hover:border-sky-400/50'
                    }`}
                  >
                    <span className="text-[10px] text-sky-400 uppercase font-bold block">Home Draw</span>
                    <strong className="text-white font-mono text-sm">{homeLoadKw} kW</strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectedNode(inspectedNode === 'battery' ? null : 'battery')}
                    className={`rounded-xl p-2.5 border transition cursor-pointer text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                      inspectedNode === 'battery' ? 'bg-[#0A261A] border-emerald-400' : 'bg-[#081726] border-[#18314C] hover:border-emerald-400/50'
                    }`}
                  >
                    <span className="text-[10px] text-emerald-400 uppercase font-bold block">Powerwall 3</span>
                    <strong className="text-white font-mono text-sm">{currentBatteryKwh.toFixed(1)} kWh</strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectedNode(inspectedNode === 'grid' ? null : 'grid')}
                    className={`rounded-xl p-2.5 border transition cursor-pointer text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                      inspectedNode === 'grid' ? 'bg-[#0C1F2E] border-emerald-400' : 'bg-[#081726] border-[#18314C] hover:border-emerald-400/50'
                    }`}
                  >
                    <span className={`text-[10px] uppercase font-bold block ${isOutageSimulated ? 'text-red-400' : 'text-emerald-400'}`}>
                      {isOutageSimulated ? 'Contactor' : gridFlowKw < 0 ? 'Net Export' : 'Grid In'}
                    </span>
                    <strong className={`font-mono text-sm ${isOutageSimulated ? 'text-red-400' : 'text-white'}`}>
                      {isOutageSimulated ? 'Open (8ms)' : `${Math.abs(gridFlowKw)} kW`}
                    </strong>
                  </button>
                </div>

                {/* Node Hardware Diagnostics Badge */}
                {inspectedNode && (
                  <div className="w-full mt-3 p-3.5 rounded-xl border border-[#234567] bg-[#071626] text-xs animate-fade-in">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-white uppercase text-[11px] flex items-center gap-1.5">
                        <Cpu className="h-3.5 w-3.5 text-[#64B5F6]" />
                        {inspectedNode === 'solar' && 'Solar Inverter & Array Telemetry'}
                        {inspectedNode === 'home' && 'Whole-Home Electrical Panel Telemetry'}
                        {inspectedNode === 'battery' && 'Dual Tesla Powerwall 3 Diagnostics'}
                        {inspectedNode === 'grid' && 'Tesla Backup Gateway 2 Contactor Telemetry'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setInspectedNode(null)}
                        className="text-[10px] text-[#8FAEC7] hover:text-white"
                      >
                        Dismiss
                      </button>
                    </div>
                    {inspectedNode === 'solar' && (
                      <p className="m-0 text-[#90CAF9] text-[11px] leading-relaxed">
                        28x REC Alpha Pure-R 455W Panels (12.8 kW DC) · Dual MPPT tracking at 98.4% efficiency · String A: 382V (11.0A) · String B: 378V (11.2A). Clean DC solar inverted on site.
                      </p>
                    )}
                    {inspectedNode === 'home' && (
                      <p className="m-0 text-[#90CAF9] text-[11px] leading-relaxed">
                        Sub-panel draw: {homeLoadKw} kW across {activeApplianceIds.length} active circuits. Continuous inverter headroom: {(11.5 - homeLoadKw).toFixed(1)} kW remaining. Motor starting LRA headroom: {(18.5 - homeLoadKw).toFixed(1)} kW.
                      </p>
                    )}
                    {inspectedNode === 'battery' && (
                      <p className="m-0 text-[#90CAF9] text-[11px] leading-relaxed">
                        Dual LFP Architecture: 27.0 kWh capacity ({currentBatteryKwh.toFixed(1)} kWh stored) · Pack 1: {batteryPct}% · Pack 2: {batteryPct}% · Internal cell temperature: 68°F (Liquid cooling nominal) · 10-Year unlimited cycle warranty.
                      </p>
                    )}
                    {inspectedNode === 'grid' && (
                      <p className="m-0 text-[#90CAF9] text-[11px] leading-relaxed">
                        {isOutageSimulated
                          ? 'Grid Contactor OPEN (8ms Reaction): Home operating as an isolated zero-carbon microgrid. Utility islanding compliance verified.'
                          : `Grid Contactor CLOSED: Phase-locked to utility 60.00 Hz AC. NEM 3.0 Real-time exchange: ${gridFlowKw < 0 ? `Exporting ${Math.abs(gridFlowKw)} kW credits` : `Importing ${gridFlowKw} kW`}.`}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: Tesla Gateway Controls & Backup Reserve */}
              <div className="space-y-5 lg:col-span-5">
                {/* Gateway Contactor Islanding Toggle */}
                <div className="rounded-2xl border border-[#1B324B] bg-[#0A1828] p-5 shadow-xl">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="m-0 text-sm font-bold text-white flex items-center gap-2">
                      <Zap className="h-4 w-4 text-[#FF6B00]" />
                      Tesla Backup Gateway Island Contactor
                    </h3>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      isOutageSimulated ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {isOutageSimulated ? 'ISLAND ACTIVE' : 'GRID LOCKED'}
                    </span>
                  </div>
                  <p className="m-0 text-xs text-[#8BA4BD]">
                    Seamlessly test whole-home islanding. The Gateway opens the high-speed contactor in 8ms with zero flicker.
                  </p>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => setIsOutageSimulated(!isOutageSimulated)}
                      className={`w-full rounded-xl py-3 px-4 text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] ${
                        isOutageSimulated
                          ? 'bg-[#4CAF50] text-white hover:bg-[#43A047] shadow-[#4CAF50]/30'
                          : 'bg-gradient-to-r from-[#FF6B00] to-[#E65100] text-white hover:brightness-110 shadow-[#FF6B00]/30'
                      }`}
                    >
                      {isOutageSimulated ? (
                        <>
                          <Check className="h-4 w-4 stroke-[3]" /> Reconnect Utility Grid (Close Contactor)
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4" /> Go Off-Grid (Open 8ms Microgrid Contactor)
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Storm Watch & Backup Reserve Slider */}
                <div className="rounded-2xl border border-[#1B324B] bg-[#0A1828] p-5 shadow-xl">
                  <div className="flex items-center justify-between">
                    <h3 className="m-0 text-sm font-bold text-white flex items-center gap-2">
                      <Shield className="h-4 w-4 text-[#4CAF50]" />
                      Backup Reserve Slider
                    </h3>
                    <span className="font-mono text-sm font-bold text-[#4CAF50]">{backupReserve}%</span>
                  </div>
                  <p className="mt-1 text-xs text-[#8BA4BD]">
                    Reserved for outages: <strong className="text-white font-mono">{((batteryCapacity * backupReserve) / 100).toFixed(1)} kWh</strong> · Daily cycling: <strong className="text-[#81C784] font-mono">{((batteryCapacity * (100 - backupReserve)) / 100).toFixed(1)} kWh</strong>.
                  </p>

                  <div className="my-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={backupReserve}
                      onChange={(e) => setBackupReserve(Number(e.target.value))}
                      className="w-full h-2 rounded-lg bg-[#18314C] accent-[#4CAF50] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-[#607D8B] mt-1 font-mono">
                      <span>0% (Max Savings)</span>
                      <span>50% (Balanced)</span>
                      <span>100% (Full Storm)</span>
                    </div>
                  </div>

                  {/* 1-Click Quick Presets */}
                  <div className="flex gap-2 pt-2">
                    {[
                      { pct: 20, label: '20% Daily Shaving' },
                      { pct: 50, label: '50% Balanced' },
                      { pct: 100, label: '100% Storm Hold' },
                    ].map((p) => (
                      <button
                        key={p.pct}
                        type="button"
                        onClick={() => setBackupReserve(p.pct)}
                        className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition cursor-pointer border ${
                          backupReserve === p.pct
                            ? 'bg-[#123824] border-[#2E7D32] text-[#81C784]'
                            : 'bg-[#081827] border-[#1C3652] text-[#8FAEC7] hover:border-[#2F537A]'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Storm Watch Toggle */}
                  <div className="pt-3 mt-3 border-t border-white/10 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <CloudLightning className="h-3.5 w-3.5 text-amber-400" /> Tesla Storm Watch
                      </span>
                      <p className="m-0 text-[11px] text-[#8BA4BD]">Auto pre-charges to 100% on NWS severe storm alert</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsStormWatchActive(!isStormWatchActive)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                        isStormWatchActive
                          ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                          : 'border border-[#234567] bg-[#0E253B] text-[#90CAF9] hover:bg-[#143452]'
                      }`}
                    >
                      {isStormWatchActive ? 'ACTIVE' : 'STANDBY'}
                    </button>
                  </div>
                </div>

                {/* Battery Specs Card */}
                <div className="rounded-2xl border border-[#1B324B] bg-[#0A1828] p-5 shadow-xl text-xs space-y-2">
                  <div className="flex justify-between items-center text-[#8FAEC7]">
                    <span>Hardware Configuration:</span>
                    <strong className="text-white">Dual Powerwall 3 (27.0 kWh)</strong>
                  </div>
                  <div className="flex justify-between items-center text-[#8FAEC7]">
                    <span>Continuous Power Rating:</span>
                    <strong className="text-white font-mono">11.5 kW Continuous</strong>
                  </div>
                  <div className="flex justify-between items-center text-[#8FAEC7]">
                    <span>Peak Motor Starting Surge:</span>
                    <strong className="text-[#81C784] font-mono">18.5 kW (LRA Ready)</strong>
                  </div>
                  <div className="flex justify-between items-center text-[#8FAEC7]">
                    <span>Est. Backup Runtime:</span>
                    <strong className="text-[#FFB300] font-mono text-sm">{estRuntimeHours} Hours</strong>
                  </div>
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectEssentialOnly}
                    className="rounded-lg px-2.5 py-1 text-[11px] font-semibold border border-[#2E7D32] bg-[#0E281C] text-[#81C784] hover:bg-[#133A29] transition cursor-pointer"
                  >
                    Essential Only
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectAllAppliances}
                    className="rounded-lg px-2.5 py-1 text-[11px] font-semibold border border-[#1C3652] bg-[#081827] text-[#90CAF9] hover:bg-[#122A42] transition cursor-pointer"
                  >
                    Power All
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAppliances}
                    className="rounded-lg px-2.5 py-1 text-[11px] font-semibold border border-white/10 bg-white/5 text-[#8BA4BD] hover:bg-white/10 transition cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Inverter Continuous Headroom Bar */}
              <div className="mb-4 rounded-xl bg-[#081827] p-3.5 border border-[#1D3650]">
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="text-[#8FAEC7] font-semibold flex items-center gap-1.5">
                    <Gauge className="h-3.5 w-3.5 text-[#64B5F6]" />
                    Inverter Continuous Power Draw: <strong className="text-white font-mono">{homeLoadKw} kW</strong> of 11.5 kW max
                  </span>
                  <span className="font-mono font-bold text-xs text-[#81C784]">
                    {(11.5 - homeLoadKw).toFixed(1)} kW Continuous Headroom ({100 - loadPercentageOfInverter}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-[#112436] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      loadPercentageOfInverter > 80 ? 'bg-amber-400' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${loadPercentageOfInverter}%` }}
                  />
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
                      className={`flex items-start justify-between p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50] ${
                        isActive
                          ? 'border-[#2E7D32] bg-[#0B2518] shadow-sm'
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

            {/* Historical 24-Hour Tesla Energy Flow Interactive Chart */}
            <div className="rounded-2xl border border-[#1F3752] bg-[#0C1E32] p-5 sm:p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4 mb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFB300]/15 text-[#FFB300]">
                      <BarChart3 className="h-4 w-4" />
                    </span>
                    <h3 className="m-0 text-base sm:text-lg font-bold text-white">
                      Tesla Energy 24-Hour Diurnal Flow History
                    </h3>
                  </div>
                  <p className="m-0 text-xs text-[#8EAEC7] mt-1">
                    Granular hourly breakdown of rooftop solar generation, home load, Powerwall charge/discharge, and grid exchange.
                  </p>
                </div>

                {historyData && (
                  <div className="flex items-center gap-3 bg-[#081827] border border-[#234567] rounded-xl px-4 py-2">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-[#8EAEC7] tracking-wider block">Self-Powered Score</span>
                      <strong className="text-base sm:text-lg font-mono font-black text-[#10B981]">
                        {historyData.self_powered_percent}% Off-Grid
                      </strong>
                    </div>
                    <div className="h-8 w-8 rounded-full border-2 border-[#10B981] flex items-center justify-center bg-[#10B981]/15 text-[#10B981] text-xs font-bold font-mono">
                      ✓
                    </div>
                  </div>
                )}
              </div>

              {historyData && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                    <span className="text-[10px] uppercase font-bold text-[#FFB300] tracking-wider block">Solar Generated</span>
                    <p className="m-0 text-lg font-bold text-white font-mono">{historyData.total_solar_kwh} kWh</p>
                    <span className="text-[10px] text-[#81C784]">100% Clean DC</span>
                  </div>
                  <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                    <span className="text-[10px] uppercase font-bold text-[#64B5F6] tracking-wider block">Home Consumed</span>
                    <p className="m-0 text-lg font-bold text-white font-mono">{historyData.total_home_kwh} kWh</p>
                    <span className="text-[10px] text-[#8EAEC7]">HVAC & Lifestyle</span>
                  </div>
                  <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                    <span className="text-[10px] uppercase font-bold text-[#10B981] tracking-wider block">NEM Grid Export</span>
                    <p className="m-0 text-lg font-bold text-[#10B981] font-mono">+{historyData.total_grid_export_kwh} kWh</p>
                    <span className="text-[10px] text-[#81C784]">Utility NEM Credit</span>
                  </div>
                  <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                    <span className="text-[10px] uppercase font-bold text-[#38BDF8] tracking-wider block">Grid Imported</span>
                    <p className="m-0 text-lg font-bold text-white font-mono">{historyData.total_grid_import_kwh} kWh</p>
                    <span className="text-[10px] text-[#81C784]">Near Zero Cost</span>
                  </div>
                </div>
              )}

              {historyData && (
                <div className="space-y-4">
                  <div className="relative bg-[#07131F] rounded-xl p-4 border border-[#162B42] overflow-x-auto">
                    <svg viewBox="0 0 720 180" className="w-full min-w-[620px] h-48">
                      <line x1="40" y1="30" x2="700" y2="30" stroke="#162B42" strokeWidth="1" strokeDasharray="2 4" />
                      <line x1="40" y1="80" x2="700" y2="80" stroke="#162B42" strokeWidth="1" strokeDasharray="2 4" />
                      <line x1="40" y1="130" x2="700" y2="130" stroke="#243C56" strokeWidth="1" />

                      <text x="32" y="34" fill="#6A87A2" fontSize="9" textAnchor="end" fontFamily="monospace">8kW</text>
                      <text x="32" y="84" fill="#6A87A2" fontSize="9" textAnchor="end" fontFamily="monospace">4kW</text>
                      <text x="32" y="134" fill="#6A87A2" fontSize="9" textAnchor="end" fontFamily="monospace">0</text>

                      {(() => {
                        const pointsStr = historyData.points.map((p: any, idx: number) => {
                          const x = 50 + idx * 27;
                          const y = 130 - (p.soePercent / 100) * 100;
                          return `${x},${y}`;
                        }).join(' ');
                        return (
                          <polyline
                            fill="none"
                            stroke="#10B981"
                            strokeWidth="2"
                            strokeDasharray="4 2"
                            opacity="0.8"
                            points={pointsStr}
                          />
                        );
                      })()}

                      {historyData.points.map((p: any, idx: number) => {
                        const x = 45 + idx * 27;
                        const solarHeight = Math.min(100, (p.solarKwh / 9.2) * 100);
                        const homeHeight = Math.min(100, (p.homeKwh / 9.2) * 100);
                        const isSelected = selectedHistoryHour === idx;

                        return (
                          <g
                            key={p.hour}
                            className="cursor-pointer transition-opacity"
                            onClick={() => setSelectedHistoryHour(idx)}
                          >
                            {isSelected && (
                              <rect
                                x={x - 2}
                                y="10"
                                width="20"
                                height="135"
                                rx="4"
                                fill="#2A4A6D"
                                opacity="0.45"
                              />
                            )}

                            <rect
                              x={x}
                              y={130 - solarHeight}
                              width="7"
                              height={solarHeight}
                              rx="2"
                              fill="#FFB300"
                              opacity={isSelected ? 1 : 0.85}
                            />

                            <rect
                              x={x + 8}
                              y={130 - homeHeight}
                              width="7"
                              height={homeHeight}
                              rx="2"
                              fill="#38BDF8"
                              opacity={isSelected ? 1 : 0.75}
                            />

                            {idx % 3 === 0 && (
                              <text
                                x={x + 7}
                                y="152"
                                fill={isSelected ? '#FFFFFF' : '#8EAEC7'}
                                fontSize="9"
                                textAnchor="middle"
                                fontFamily="monospace"
                                fontWeight={isSelected ? 'bold' : 'normal'}
                              >
                                {p.hour}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-2 border-t border-[#162B42]">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5 text-white font-medium">
                          <span className="h-3 w-3 rounded-sm bg-[#FFB300]" /> Solar (kW)
                        </span>
                        <span className="flex items-center gap-1.5 text-white font-medium">
                          <span className="h-3 w-3 rounded-sm bg-[#38BDF8]" /> Home Load (kW)
                        </span>
                        <span className="flex items-center gap-1.5 text-[#10B981] font-medium">
                          <span className="h-0.5 w-4 bg-[#10B981] inline-block border-t border-dashed" /> Powerwall SOE (%)
                        </span>
                      </div>
                      <span className="text-[11px] text-[#6A87A2]">Click any hour to inspect exact energy exchange</span>
                    </div>
                  </div>

                  {selectedHistoryHour !== null && historyData.points[selectedHistoryHour] && (
                    <div className="rounded-xl bg-[#091D2F] p-4 border border-[#254A70] flex flex-wrap items-center justify-between gap-4 animate-fade-in">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-[#FF6B00]/20 px-2.5 py-0.5 text-xs font-bold text-[#FF8A2B]">
                            {historyData.points[selectedHistoryHour].hour}
                          </span>
                          <strong className="text-white text-sm">Telemetry Snapshot</strong>
                        </div>
                        <span className="text-xs text-[#8EAEC7] mt-0.5 block">
                          Battery State of Energy: <strong className="text-[#10B981] font-mono">{historyData.points[selectedHistoryHour].soePercent}%</strong>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">SOLAR</span>
                          <strong className="text-[#FFB300]">{historyData.points[selectedHistoryHour].solarKwh.toFixed(2)} kWh</strong>
                        </div>
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">HOME LOAD</span>
                          <strong className="text-[#38BDF8]">{historyData.points[selectedHistoryHour].homeKwh.toFixed(2)} kWh</strong>
                        </div>
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">BATTERY CHARGE</span>
                          <strong className="text-[#10B981]">+{historyData.points[selectedHistoryHour].batteryChargeKwh.toFixed(2)} kWh</strong>
                        </div>
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">BATTERY DISCHARGE</span>
                          <strong className="text-[#FF8A2B]">-{historyData.points[selectedHistoryHour].batteryDischargeKwh.toFixed(2)} kWh</strong>
                        </div>
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">GRID EXPORT</span>
                          <strong className="text-[#10B981]">+{historyData.points[selectedHistoryHour].gridExportKwh.toFixed(2)} kWh</strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: MYSUNRUN 7-STAGE PTO & CONSTRUCTION MILESTONE PIPELINE */}
        {/* ========================================================================= */}
        {activeTab === 'milestones' && (
          <div className="space-y-8 animate-fade-in">
            {/* Header Card */}
            <div className="rounded-3xl border border-[#1E4A38] bg-gradient-to-br from-[#0B2519] via-[#091D2C] to-[#07131F] p-6 sm:p-8 shadow-2xl relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex flex-wrap items-center gap-2.5 mb-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#10B981]/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#34D399]">
                    <CheckCircle className="h-4 w-4" /> 100% Commissioned & Energized
                  </span>
                  <span className="rounded-full bg-[#14314A] px-2.5 py-1 text-xs font-semibold text-[#64B5F6]">
                    PTO Granted by Electric Utility
                  </span>
                </div>
                <h2 className="m-0 text-2xl sm:text-4xl font-black tracking-tight text-white">
                  mySunrun Construction & PTO Milestone Tracker
                </h2>
                <p className="m-0 mt-2 text-sm sm:text-base text-[#C2D7EA] max-w-2xl leading-relaxed">
                  Track your complete solar installation lifecycle from initial contract signature to utility permission to operate (PTO). Every milestone is verified with official engineering, municipal inspection, and utility sign-offs.
                </p>

                {/* Progress Bar (7/7 Complete) */}
                <div className="mt-6 max-w-xl">
                  <div className="flex justify-between items-center text-xs font-bold mb-2">
                    <span className="text-[#81C784]">All 7 Milestones Completed</span>
                    <span className="text-white font-mono">Stage 7 of 7 (100%)</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-[#0E2C1E] border border-[#1B4B32] overflow-hidden p-0.5">
                    <div className="h-full w-full rounded-full bg-gradient-to-r from-[#10B981] via-[#34D399] to-[#4CAF50] shadow-sm animate-pulse" />
                  </div>
                </div>
              </div>
            </div>

            {/* 7-Stage Milestone Stepper */}
            <div className="space-y-4 relative">
              {/* Vertical Luminous Pipeline Connecting Bar */}
              <div className="hidden md:block absolute left-[38px] top-6 bottom-6 w-0.5 bg-gradient-to-b from-[#10B981] via-[#34D399] to-[#4CAF50] -z-0 opacity-40" />

              {SUNRUN_MILESTONES.map((stage) => (
                <div
                  key={stage.id}
                  className={`rounded-2xl border transition-all duration-200 p-5 sm:p-6 relative z-10 hover:translate-x-1 ${
                    stage.status === 'active'
                      ? 'border-[#10B981] bg-[#0A2217] shadow-xl shadow-[#10B981]/15'
                      : 'border-[#1B324B] bg-[#0C1E32] hover:border-[#2A4D73]'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      {/* Step Number Badge */}
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-black text-sm shadow-md ${
                        stage.status === 'active'
                          ? 'bg-[#10B981] text-white animate-pulse'
                          : 'bg-[#18392B] text-[#81C784] border border-[#2E7D32]'
                      }`}>
                        {stage.status === 'completed' ? (
                          <Check className="h-5 w-5 stroke-[3]" />
                        ) : (
                          <Zap className="h-5 w-5 text-white" />
                        )}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-mono font-bold text-[#A5C3DF]">
                            STAGE {stage.id} OF 7 · {stage.duration}
                          </span>
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                            stage.status === 'active'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-[#123120] text-[#81C784]'
                          }`}>
                            {stage.status === 'active' ? '● Live Telemetry Active' : '✓ Verified & Complete'}
                          </span>
                        </div>

                        <h3 className="m-0 mt-1.5 text-lg sm:text-xl font-bold text-white">
                          {stage.name}
                        </h3>

                        <p className="m-0 mt-1 text-xs sm:text-sm text-[#A8C4DF] leading-relaxed">
                          {stage.details}
                        </p>

                        {/* Deliverables Checklist */}
                        <div className="mt-3 space-y-1.5">
                          {stage.deliverables.map((item, dIdx) => (
                            <div key={dIdx} className="flex items-center gap-2 text-xs text-[#8BA4BD]">
                              <CheckCircle2 className="h-3.5 w-3.5 text-[#4CAF50] shrink-0" />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>

                        {/* Team Lead Sign-Off */}
                        <div className="mt-4 flex flex-wrap items-center gap-3 pt-3 border-t border-white/10 text-xs">
                          <span className="text-[#64B5F6] font-semibold flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-[#4CAF50]" /> Verified Sign-off:
                          </span>
                          <span className="text-white font-medium">{stage.signOffLead}</span>
                          <span className="text-[#607D8B]">({stage.role})</span>
                          <span className="text-[#8FAEC7] font-mono ml-auto">{stage.date}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Action: View Certificate / Inspection Document */}
                    <div className="md:self-start shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedMilestoneDoc(stage)}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#234567] bg-[#0E253B] px-3.5 py-2 text-xs font-semibold text-[#90CAF9] hover:bg-[#143452] hover:border-[#3B6694] transition cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2196F3]"
                      >
                        <FileText className="h-4 w-4 text-[#FFB300]" />
                        <span>View Certificate</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: REFERRAL SYSTEM ($1,000 CASH REWARD) */}
        {/* ========================================================================= */}
        {activeTab === 'referrals' && (
          <div className="space-y-8 animate-fade-in">
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
                        className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] ${
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
                  <span className="text-[#FFB300] font-bold">{referralCount} Neighbors</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={referralCount}
                  onChange={(e) => setReferralCount(Number(e.target.value))}
                  className="w-full h-2 rounded-lg bg-[#18314C] accent-[#FF6B00] cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-[#5D7A96] mt-1 font-mono">
                  <span>1 Referral ($1,000)</span>
                  <span>5 Referrals ($5,000)</span>
                  <span>10 Referrals ($10,000)</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                  <span className="text-[11px] uppercase font-bold text-[#8FAEC7]">Prorated 1st Year Bill</span>
                  <p className="m-0 text-lg font-bold text-white font-mono">$0 Electric Cost</p>
                  <span className="text-[10px] text-[#81C784]">Covered by referral payouts</span>
                </div>
                <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                  <span className="text-[11px] uppercase font-bold text-[#8FAEC7]">Average Payout Speed</span>
                  <p className="m-0 text-lg font-bold text-white font-mono">24 Hours from PTO</p>
                  <span className="text-[10px] text-[#81C784]">Zelle or Direct ACH</span>
                </div>
                <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                  <span className="text-[11px] uppercase font-bold text-[#8FAEC7]">Dedicated Advisor</span>
                  <p className="m-0 text-lg font-bold text-[#FF8A2B]">Horace Lawrence</p>
                  <span className="text-[10px] text-[#8FAEC7]">White-glove coordination</span>
                </div>
              </div>
            </div>

            {/* Direct Referral Submission Form */}
            <div id="referralPipelineSection" className="rounded-2xl border border-[#1F3752] bg-[#0C1E32] p-6 shadow-xl">
              <h3 className="m-0 text-lg font-bold text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-[#FF6B00]" /> Send Horace a Direct Neighbor Referral
              </h3>
              <p className="m-0 mt-1 text-xs text-[#8BA4BD]">
                Provide your friend or neighbor’s information. Horace Lawrence will reach out with a personalized zero-down solar + Powerwall proposal and credit you upon install.
              </p>

              {formFeedback && (
                <div className={`mt-4 p-4 rounded-xl text-xs sm:text-sm font-semibold ${
                  formFeedback.type === 'success' ? 'bg-[#0E2C1E] border border-[#2E7D32] text-[#81C784]' : 'bg-[#3A1212] border border-red-500 text-red-200'
                }`}>
                  {formFeedback.message}
                </div>
              )}

              <form onSubmit={handleDirectReferralSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="refNeighborName" className="block text-xs font-bold uppercase tracking-wider text-[#8FAEC7] mb-1">
                    Neighbor Full Name *
                  </label>
                  <input
                    id="refNeighborName"
                    type="text"
                    required
                    value={refName}
                    onChange={(e) => setRefName(e.target.value)}
                    placeholder="e.g. David Mitchell"
                    className="w-full rounded-xl border border-[#244263] bg-[#081827] px-3.5 py-2.5 text-sm text-white placeholder-[#506A85] focus:border-[#FF6B00] focus:outline-none focus:ring-1 focus:ring-[#FF6B00]"
                  />
                </div>

                <div>
                  <label htmlFor="refNeighborPhone" className="block text-xs font-bold uppercase tracking-wider text-[#8FAEC7] mb-1">
                    Phone Number *
                  </label>
                  <input
                    id="refNeighborPhone"
                    type="tel"
                    required
                    value={refPhone}
                    onChange={(e) => setRefPhone(e.target.value)}
                    placeholder="e.g. 510-555-0199"
                    className="w-full rounded-xl border border-[#244263] bg-[#081827] px-3.5 py-2.5 text-sm text-white placeholder-[#506A85] focus:border-[#FF6B00] focus:outline-none focus:ring-1 focus:ring-[#FF6B00]"
                  />
                </div>

                <div>
                  <label htmlFor="refNeighborEmail" className="block text-xs font-bold uppercase tracking-wider text-[#8FAEC7] mb-1">
                    Email Address (Optional)
                  </label>
                  <input
                    id="refNeighborEmail"
                    type="email"
                    value={refEmail}
                    onChange={(e) => setRefEmail(e.target.value)}
                    placeholder="neighbor@example.com"
                    className="w-full rounded-xl border border-[#244263] bg-[#081827] px-3.5 py-2.5 text-sm text-white placeholder-[#506A85] focus:border-[#FF6B00] focus:outline-none focus:ring-1 focus:ring-[#FF6B00]"
                  />
                </div>

                <div>
                  <label htmlFor="refNeighborAddress" className="block text-xs font-bold uppercase tracking-wider text-[#8FAEC7] mb-1">
                    Address / Neighborhood
                  </label>
                  <input
                    id="refNeighborAddress"
                    type="text"
                    value={refAddress}
                    onChange={(e) => setRefAddress(e.target.value)}
                    placeholder="e.g. 1420 Skyline Blvd, Oakland"
                    className="w-full rounded-xl border border-[#244263] bg-[#081827] px-3.5 py-2.5 text-sm text-white placeholder-[#506A85] focus:border-[#FF6B00] focus:outline-none focus:ring-1 focus:ring-[#FF6B00]"
                  />
                </div>

                <div>
                  <label htmlFor="refNeighborUtility" className="block text-xs font-bold uppercase tracking-wider text-[#8FAEC7] mb-1">
                    Utility Provider
                  </label>
                  <select
                    id="refNeighborUtility"
                    value={refUtility}
                    onChange={(e) => setRefUtility(e.target.value)}
                    className="w-full rounded-xl border border-[#244263] bg-[#081827] px-3.5 py-2.5 text-sm text-white focus:border-[#FF6B00] focus:outline-none focus:ring-1 focus:ring-[#FF6B00]"
                  >
                    <option value="PG&E">PG&E (California)</option>
                    <option value="Entergy Texas">Entergy Texas</option>
                    <option value="CenterPoint Houston">CenterPoint Energy (Houston)</option>
                    <option value="Oncor Electric">Oncor Electric (Dallas/Fort Worth)</option>
                    <option value="SoCal Edison">Southern California Edison</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="refNeighborBill" className="block text-xs font-bold uppercase tracking-wider text-[#8FAEC7] mb-1">
                    Estimated Electric Bill
                  </label>
                  <select
                    id="refNeighborBill"
                    value={refBill}
                    onChange={(e) => setRefBill(e.target.value)}
                    className="w-full rounded-xl border border-[#244263] bg-[#081827] px-3.5 py-2.5 text-sm text-white focus:border-[#FF6B00] focus:outline-none focus:ring-1 focus:ring-[#FF6B00]"
                  >
                    <option value="$150 - $250">$150 - $250 / month</option>
                    <option value="$250 - $350">$250 - $350 / month</option>
                    <option value="$350 - $500">$350 - $500 / month</option>
                    <option value="$500+">$500+ / month (High Savings Potential)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="refNeighborNotes" className="block text-xs font-bold uppercase tracking-wider text-[#8FAEC7] mb-1">
                    Notes for Horace (Roof details, electric vehicle, power outages)
                  </label>
                  <textarea
                    id="refNeighborNotes"
                    rows={2}
                    value={refNotes}
                    onChange={(e) => setRefNotes(e.target.value)}
                    placeholder="e.g. Complained about high summer A/C bills and frequent winter storm outages..."
                    className="w-full rounded-xl border border-[#244263] bg-[#081827] px-3.5 py-2 text-sm text-white placeholder-[#506A85] focus:border-[#FF6B00] focus:outline-none focus:ring-1 focus:ring-[#FF6B00]"
                  />
                </div>

                <div className="sm:col-span-2 flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <span className="text-xs text-[#8BA4BD]">
                    Locking in <strong className="text-[#FF8A2B]">${rewardTier.toLocaleString()}</strong> reward for your account.
                  </span>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65100] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#FF6B00]/30 hover:brightness-110 transition cursor-pointer disabled:opacity-50 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
                  >
                    {isSubmitting ? 'Submitting to Horace...' : 'Submit Referral & Lock In Cash'}
                  </button>
                </div>
              </form>
            </div>

            {/* Referrals Tracking Table */}
            <div className="rounded-2xl border border-[#1F3752] bg-[#0C1E32] p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="m-0 text-base font-bold text-white">Your Submitted Referrals</h3>
                <span className="text-xs text-[#8BA4BD]">Live Tracking Status</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-[#8FAEC7]">
                      <th className="pb-3 font-semibold">Referral ID</th>
                      <th className="pb-3 font-semibold">Neighbor</th>
                      <th className="pb-3 font-semibold">System Quoted</th>
                      <th className="pb-3 font-semibold">Status</th>
                      <th className="pb-3 font-semibold text-right">Reward</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {referrals.map((r) => (
                      <tr key={r.id} className="text-white">
                        <td className="py-3 font-mono text-[#64B5F6]">{r.id}</td>
                        <td className="py-3">
                          <strong className="block text-white">{r.name}</strong>
                          <span className="text-[11px] text-[#8BA4BD]">{r.location}</span>
                        </td>
                        <td className="py-3 text-[#B0C7DE]">{r.system}</td>
                        <td className="py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            r.status === 'paid'
                              ? 'bg-[#123120] text-[#81C784]'
                              : r.status === 'pending'
                              ? 'bg-[#3A1E08] text-[#FF8A2B]'
                              : 'bg-white/10 text-white'
                          }`}>
                            {r.status === 'paid' ? <Check className="h-3 w-3" /> : null}
                            {r.statusLabel}
                          </span>
                        </td>
                        <td className="py-3 text-right font-mono font-bold text-[#FFB300]">
                          ${r.reward.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Historical 24-Hour Tesla Energy Flow Interactive Chart */}
            <div className="rounded-2xl border border-[#1F3752] bg-[#0C1E32] p-5 sm:p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4 mb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFB300]/15 text-[#FFB300]">
                      <BarChart3 className="h-4 w-4" />
                    </span>
                    <h3 className="m-0 text-base sm:text-lg font-bold text-white">
                      Tesla Energy 24-Hour Diurnal Flow History
                    </h3>
                  </div>
                  <p className="m-0 text-xs text-[#8EAEC7] mt-1">
                    Granular hourly breakdown of rooftop solar generation, home load, Powerwall charge/discharge, and grid exchange.
                  </p>
                </div>

                {historyData && (
                  <div className="flex items-center gap-3 bg-[#081827] border border-[#234567] rounded-xl px-4 py-2">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-[#8EAEC7] tracking-wider block">Self-Powered Score</span>
                      <strong className="text-base sm:text-lg font-mono font-black text-[#10B981]">
                        {historyData.self_powered_percent}% Off-Grid
                      </strong>
                    </div>
                    <div className="h-8 w-8 rounded-full border-2 border-[#10B981] flex items-center justify-center bg-[#10B981]/15 text-[#10B981] text-xs font-bold font-mono">
                      ✓
                    </div>
                  </div>
                )}
              </div>

              {historyData && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                    <span className="text-[10px] uppercase font-bold text-[#FFB300] tracking-wider block">Solar Generated</span>
                    <p className="m-0 text-lg font-bold text-white font-mono">{historyData.total_solar_kwh} kWh</p>
                    <span className="text-[10px] text-[#81C784]">100% Clean DC</span>
                  </div>
                  <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                    <span className="text-[10px] uppercase font-bold text-[#64B5F6] tracking-wider block">Home Consumed</span>
                    <p className="m-0 text-lg font-bold text-white font-mono">{historyData.total_home_kwh} kWh</p>
                    <span className="text-[10px] text-[#8EAEC7]">HVAC & Lifestyle</span>
                  </div>
                  <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                    <span className="text-[10px] uppercase font-bold text-[#10B981] tracking-wider block">NEM Grid Export</span>
                    <p className="m-0 text-lg font-bold text-[#10B981] font-mono">+{historyData.total_grid_export_kwh} kWh</p>
                    <span className="text-[10px] text-[#81C784]">Utility NEM Credit</span>
                  </div>
                  <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                    <span className="text-[10px] uppercase font-bold text-[#38BDF8] tracking-wider block">Grid Imported</span>
                    <p className="m-0 text-lg font-bold text-white font-mono">{historyData.total_grid_import_kwh} kWh</p>
                    <span className="text-[10px] text-[#81C784]">Near Zero Cost</span>
                  </div>
                </div>
              )}

              {historyData && (
                <div className="space-y-4">
                  <div className="relative bg-[#07131F] rounded-xl p-4 border border-[#162B42] overflow-x-auto">
                    <svg viewBox="0 0 720 180" className="w-full min-w-[620px] h-48">
                      <line x1="40" y1="30" x2="700" y2="30" stroke="#162B42" strokeWidth="1" strokeDasharray="2 4" />
                      <line x1="40" y1="80" x2="700" y2="80" stroke="#162B42" strokeWidth="1" strokeDasharray="2 4" />
                      <line x1="40" y1="130" x2="700" y2="130" stroke="#243C56" strokeWidth="1" />

                      <text x="32" y="34" fill="#6A87A2" fontSize="9" textAnchor="end" fontFamily="monospace">8kW</text>
                      <text x="32" y="84" fill="#6A87A2" fontSize="9" textAnchor="end" fontFamily="monospace">4kW</text>
                      <text x="32" y="134" fill="#6A87A2" fontSize="9" textAnchor="end" fontFamily="monospace">0</text>

                      {(() => {
                        const pointsStr = historyData.points.map((p: any, idx: number) => {
                          const x = 50 + idx * 27;
                          const y = 130 - (p.soePercent / 100) * 100;
                          return `${x},${y}`;
                        }).join(' ');
                        return (
                          <polyline
                            fill="none"
                            stroke="#10B981"
                            strokeWidth="2"
                            strokeDasharray="4 2"
                            opacity="0.8"
                            points={pointsStr}
                          />
                        );
                      })()}

                      {historyData.points.map((p: any, idx: number) => {
                        const x = 45 + idx * 27;
                        const solarHeight = Math.min(100, (p.solarKwh / 9.2) * 100);
                        const homeHeight = Math.min(100, (p.homeKwh / 9.2) * 100);
                        const isSelected = selectedHistoryHour === idx;

                        return (
                          <g
                            key={p.hour}
                            className="cursor-pointer transition-opacity"
                            onClick={() => setSelectedHistoryHour(idx)}
                          >
                            {isSelected && (
                              <rect
                                x={x - 2}
                                y="10"
                                width="20"
                                height="135"
                                rx="4"
                                fill="#2A4A6D"
                                opacity="0.45"
                              />
                            )}

                            <rect
                              x={x}
                              y={130 - solarHeight}
                              width="7"
                              height={solarHeight}
                              rx="2"
                              fill="#FFB300"
                              opacity={isSelected ? 1 : 0.85}
                            />

                            <rect
                              x={x + 8}
                              y={130 - homeHeight}
                              width="7"
                              height={homeHeight}
                              rx="2"
                              fill="#38BDF8"
                              opacity={isSelected ? 1 : 0.75}
                            />

                            {idx % 3 === 0 && (
                              <text
                                x={x + 7}
                                y="152"
                                fill={isSelected ? '#FFFFFF' : '#8EAEC7'}
                                fontSize="9"
                                textAnchor="middle"
                                fontFamily="monospace"
                                fontWeight={isSelected ? 'bold' : 'normal'}
                              >
                                {p.hour}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-2 border-t border-[#162B42]">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5 text-white font-medium">
                          <span className="h-3 w-3 rounded-sm bg-[#FFB300]" /> Solar (kW)
                        </span>
                        <span className="flex items-center gap-1.5 text-white font-medium">
                          <span className="h-3 w-3 rounded-sm bg-[#38BDF8]" /> Home Load (kW)
                        </span>
                        <span className="flex items-center gap-1.5 text-[#10B981] font-medium">
                          <span className="h-0.5 w-4 bg-[#10B981] inline-block border-t border-dashed" /> Powerwall SOE (%)
                        </span>
                      </div>
                      <span className="text-[11px] text-[#6A87A2]">Click any hour to inspect exact energy exchange</span>
                    </div>
                  </div>

                  {selectedHistoryHour !== null && historyData.points[selectedHistoryHour] && (
                    <div className="rounded-xl bg-[#091D2F] p-4 border border-[#254A70] flex flex-wrap items-center justify-between gap-4 animate-fade-in">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-[#FF6B00]/20 px-2.5 py-0.5 text-xs font-bold text-[#FF8A2B]">
                            {historyData.points[selectedHistoryHour].hour}
                          </span>
                          <strong className="text-white text-sm">Telemetry Snapshot</strong>
                        </div>
                        <span className="text-xs text-[#8EAEC7] mt-0.5 block">
                          Battery State of Energy: <strong className="text-[#10B981] font-mono">{historyData.points[selectedHistoryHour].soePercent}%</strong>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">SOLAR</span>
                          <strong className="text-[#FFB300]">{historyData.points[selectedHistoryHour].solarKwh.toFixed(2)} kWh</strong>
                        </div>
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">HOME LOAD</span>
                          <strong className="text-[#38BDF8]">{historyData.points[selectedHistoryHour].homeKwh.toFixed(2)} kWh</strong>
                        </div>
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">BATTERY CHARGE</span>
                          <strong className="text-[#10B981]">+{historyData.points[selectedHistoryHour].batteryChargeKwh.toFixed(2)} kWh</strong>
                        </div>
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">BATTERY DISCHARGE</span>
                          <strong className="text-[#FF8A2B]">-{historyData.points[selectedHistoryHour].batteryDischargeKwh.toFixed(2)} kWh</strong>
                        </div>
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">GRID EXPORT</span>
                          <strong className="text-[#10B981]">+{historyData.points[selectedHistoryHour].gridExportKwh.toFixed(2)} kWh</strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: SAVINGS & 25-YEAR PERFORMANCE */}
        {/* ========================================================================= */}
        {activeTab === 'savings' && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-2xl border border-[#1B324B] bg-[#0C1E32] p-5 shadow-xl">
                <span className="text-xs uppercase font-bold text-[#7E98B0] tracking-wider">Estimated Monthly Savings</span>
                <p className="m-0 mt-3 text-3xl font-black text-[#4CAF50] font-mono">$367.40</p>
                <p className="m-0 mt-1 text-xs text-[#8BA4BD]">Compared to average local utility bill of $385.00/mo.</p>
                <div className="mt-4 border-t border-white/10 pt-3 text-xs text-[#8BA4BD]">
                  Annual Net Savings: <strong className="text-white font-mono">$4,408.80 / yr</strong>
                </div>
              </div>

              <div className="rounded-2xl border border-[#1B324B] bg-[#0C1E32] p-5 shadow-xl">
                <span className="text-xs uppercase font-bold text-[#7E98B0] tracking-wider">Lifetime Solar Generation</span>
                <p className="m-0 mt-3 text-3xl font-black text-[#FFB300] font-mono">18,420 kWh</p>
                <p className="m-0 mt-1 text-xs text-[#8BA4BD]">Clean DC power generated and inverted on site.</p>
                <div className="mt-4 border-t border-white/10 pt-3 text-xs text-[#8BA4BD]">
                  Net Metering Credits: <strong className="text-[#81C784] font-mono">+3,840 kWh Exported</strong>
                </div>
              </div>

              <div className="rounded-2xl border border-[#1B324B] bg-[#0C1E32] p-5 shadow-xl">
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

            {/* Historical 24-Hour Tesla Energy Flow Interactive Chart */}
            <div className="rounded-2xl border border-[#1F3752] bg-[#0C1E32] p-5 sm:p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4 mb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFB300]/15 text-[#FFB300]">
                      <BarChart3 className="h-4 w-4" />
                    </span>
                    <h3 className="m-0 text-base sm:text-lg font-bold text-white">
                      Tesla Energy 24-Hour Diurnal Flow History
                    </h3>
                  </div>
                  <p className="m-0 text-xs text-[#8EAEC7] mt-1">
                    Granular hourly breakdown of rooftop solar generation, home load, Powerwall charge/discharge, and grid exchange.
                  </p>
                </div>

                {historyData && (
                  <div className="flex items-center gap-3 bg-[#081827] border border-[#234567] rounded-xl px-4 py-2">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-[#8EAEC7] tracking-wider block">Self-Powered Score</span>
                      <strong className="text-base sm:text-lg font-mono font-black text-[#10B981]">
                        {historyData.self_powered_percent}% Off-Grid
                      </strong>
                    </div>
                    <div className="h-8 w-8 rounded-full border-2 border-[#10B981] flex items-center justify-center bg-[#10B981]/15 text-[#10B981] text-xs font-bold font-mono">
                      ✓
                    </div>
                  </div>
                )}
              </div>

              {historyData && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                    <span className="text-[10px] uppercase font-bold text-[#FFB300] tracking-wider block">Solar Generated</span>
                    <p className="m-0 text-lg font-bold text-white font-mono">{historyData.total_solar_kwh} kWh</p>
                    <span className="text-[10px] text-[#81C784]">100% Clean DC</span>
                  </div>
                  <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                    <span className="text-[10px] uppercase font-bold text-[#64B5F6] tracking-wider block">Home Consumed</span>
                    <p className="m-0 text-lg font-bold text-white font-mono">{historyData.total_home_kwh} kWh</p>
                    <span className="text-[10px] text-[#8EAEC7]">HVAC & Lifestyle</span>
                  </div>
                  <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                    <span className="text-[10px] uppercase font-bold text-[#10B981] tracking-wider block">NEM Grid Export</span>
                    <p className="m-0 text-lg font-bold text-[#10B981] font-mono">+{historyData.total_grid_export_kwh} kWh</p>
                    <span className="text-[10px] text-[#81C784]">Utility NEM Credit</span>
                  </div>
                  <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                    <span className="text-[10px] uppercase font-bold text-[#38BDF8] tracking-wider block">Grid Imported</span>
                    <p className="m-0 text-lg font-bold text-white font-mono">{historyData.total_grid_import_kwh} kWh</p>
                    <span className="text-[10px] text-[#81C784]">Near Zero Cost</span>
                  </div>
                </div>
              )}

              {historyData && (
                <div className="space-y-4">
                  <div className="relative bg-[#07131F] rounded-xl p-4 border border-[#162B42] overflow-x-auto">
                    <svg viewBox="0 0 720 180" className="w-full min-w-[620px] h-48">
                      <line x1="40" y1="30" x2="700" y2="30" stroke="#162B42" strokeWidth="1" strokeDasharray="2 4" />
                      <line x1="40" y1="80" x2="700" y2="80" stroke="#162B42" strokeWidth="1" strokeDasharray="2 4" />
                      <line x1="40" y1="130" x2="700" y2="130" stroke="#243C56" strokeWidth="1" />

                      <text x="32" y="34" fill="#6A87A2" fontSize="9" textAnchor="end" fontFamily="monospace">8kW</text>
                      <text x="32" y="84" fill="#6A87A2" fontSize="9" textAnchor="end" fontFamily="monospace">4kW</text>
                      <text x="32" y="134" fill="#6A87A2" fontSize="9" textAnchor="end" fontFamily="monospace">0</text>

                      {(() => {
                        const pointsStr = historyData.points.map((p: any, idx: number) => {
                          const x = 50 + idx * 27;
                          const y = 130 - (p.soePercent / 100) * 100;
                          return `${x},${y}`;
                        }).join(' ');
                        return (
                          <polyline
                            fill="none"
                            stroke="#10B981"
                            strokeWidth="2"
                            strokeDasharray="4 2"
                            opacity="0.8"
                            points={pointsStr}
                          />
                        );
                      })()}

                      {historyData.points.map((p: any, idx: number) => {
                        const x = 45 + idx * 27;
                        const solarHeight = Math.min(100, (p.solarKwh / 9.2) * 100);
                        const homeHeight = Math.min(100, (p.homeKwh / 9.2) * 100);
                        const isSelected = selectedHistoryHour === idx;

                        return (
                          <g
                            key={p.hour}
                            className="cursor-pointer transition-opacity"
                            onClick={() => setSelectedHistoryHour(idx)}
                          >
                            {isSelected && (
                              <rect
                                x={x - 2}
                                y="10"
                                width="20"
                                height="135"
                                rx="4"
                                fill="#2A4A6D"
                                opacity="0.45"
                              />
                            )}

                            <rect
                              x={x}
                              y={130 - solarHeight}
                              width="7"
                              height={solarHeight}
                              rx="2"
                              fill="#FFB300"
                              opacity={isSelected ? 1 : 0.85}
                            />

                            <rect
                              x={x + 8}
                              y={130 - homeHeight}
                              width="7"
                              height={homeHeight}
                              rx="2"
                              fill="#38BDF8"
                              opacity={isSelected ? 1 : 0.75}
                            />

                            {idx % 3 === 0 && (
                              <text
                                x={x + 7}
                                y="152"
                                fill={isSelected ? '#FFFFFF' : '#8EAEC7'}
                                fontSize="9"
                                textAnchor="middle"
                                fontFamily="monospace"
                                fontWeight={isSelected ? 'bold' : 'normal'}
                              >
                                {p.hour}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-2 border-t border-[#162B42]">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5 text-white font-medium">
                          <span className="h-3 w-3 rounded-sm bg-[#FFB300]" /> Solar (kW)
                        </span>
                        <span className="flex items-center gap-1.5 text-white font-medium">
                          <span className="h-3 w-3 rounded-sm bg-[#38BDF8]" /> Home Load (kW)
                        </span>
                        <span className="flex items-center gap-1.5 text-[#10B981] font-medium">
                          <span className="h-0.5 w-4 bg-[#10B981] inline-block border-t border-dashed" /> Powerwall SOE (%)
                        </span>
                      </div>
                      <span className="text-[11px] text-[#6A87A2]">Click any hour to inspect exact energy exchange</span>
                    </div>
                  </div>

                  {selectedHistoryHour !== null && historyData.points[selectedHistoryHour] && (
                    <div className="rounded-xl bg-[#091D2F] p-4 border border-[#254A70] flex flex-wrap items-center justify-between gap-4 animate-fade-in">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-[#FF6B00]/20 px-2.5 py-0.5 text-xs font-bold text-[#FF8A2B]">
                            {historyData.points[selectedHistoryHour].hour}
                          </span>
                          <strong className="text-white text-sm">Telemetry Snapshot</strong>
                        </div>
                        <span className="text-xs text-[#8EAEC7] mt-0.5 block">
                          Battery State of Energy: <strong className="text-[#10B981] font-mono">{historyData.points[selectedHistoryHour].soePercent}%</strong>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">SOLAR</span>
                          <strong className="text-[#FFB300]">{historyData.points[selectedHistoryHour].solarKwh.toFixed(2)} kWh</strong>
                        </div>
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">HOME LOAD</span>
                          <strong className="text-[#38BDF8]">{historyData.points[selectedHistoryHour].homeKwh.toFixed(2)} kWh</strong>
                        </div>
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">BATTERY CHARGE</span>
                          <strong className="text-[#10B981]">+{historyData.points[selectedHistoryHour].batteryChargeKwh.toFixed(2)} kWh</strong>
                        </div>
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">BATTERY DISCHARGE</span>
                          <strong className="text-[#FF8A2B]">-{historyData.points[selectedHistoryHour].batteryDischargeKwh.toFixed(2)} kWh</strong>
                        </div>
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">GRID EXPORT</span>
                          <strong className="text-[#10B981]">+{historyData.points[selectedHistoryHour].gridExportKwh.toFixed(2)} kWh</strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: SUNRUN ADVISOR & WARRANTY */}
        {/* ========================================================================= */}
        {activeTab === 'concierge' && (
          <div className="space-y-6 animate-fade-in">
            <div className="rounded-2xl border border-[#1B324B] bg-gradient-to-br from-[#0C1E32] via-[#091D30] to-[#081726] p-6 sm:p-8 shadow-xl">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FF6B00]/20 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-[#FF8A2B]">
                    <Sparkles className="h-3.5 w-3.5 text-[#FF8A2B]" /> Dedicated Sunrun Solar Expert
                  </span>
                  <h2 className="m-0 mt-2 text-2xl sm:text-3xl font-black text-white">Horace Lawrence</h2>
                  <p className="m-0 mt-0.5 text-sm text-[#8BA4BD]">The Block Sales Expert Team Lead · Sunrun Solar Advisor</p>

                  <div className="mt-4 flex flex-wrap gap-4 text-sm">
                    <a href="tel:+15102417007" className="inline-flex items-center gap-2 text-white font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] rounded">
                      <Phone className="h-4 w-4 text-[#FF6B00]" /> 510-241-7007
                    </a>
                    <a href="mailto:horace.lawrence@sunrun.com" className="inline-flex items-center gap-2 text-white font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] rounded">
                      <Mail className="h-4 w-4 text-[#FF6B00]" /> horace.lawrence@sunrun.com
                    </a>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 w-full md:w-auto">
                  <a
                    href="/book"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65100] px-5 py-3 text-sm font-bold text-white hover:brightness-110 transition no-underline shadow-lg shadow-[#FF6B00]/25 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
                  >
                    <Calendar className="h-4 w-4" /> Book Time With Horace
                  </a>
                  <a
                    href="tel:+15102417007"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#264A6E] bg-[#0E2841] px-5 py-2.5 text-xs font-semibold text-[#A9C8E8] hover:bg-[#153859] transition no-underline active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2196F3]"
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

            {/* Historical 24-Hour Tesla Energy Flow Interactive Chart */}
            <div className="rounded-2xl border border-[#1F3752] bg-[#0C1E32] p-5 sm:p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4 mb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FFB300]/15 text-[#FFB300]">
                      <BarChart3 className="h-4 w-4" />
                    </span>
                    <h3 className="m-0 text-base sm:text-lg font-bold text-white">
                      Tesla Energy 24-Hour Diurnal Flow History
                    </h3>
                  </div>
                  <p className="m-0 text-xs text-[#8EAEC7] mt-1">
                    Granular hourly breakdown of rooftop solar generation, home load, Powerwall charge/discharge, and grid exchange.
                  </p>
                </div>

                {historyData && (
                  <div className="flex items-center gap-3 bg-[#081827] border border-[#234567] rounded-xl px-4 py-2">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-[#8EAEC7] tracking-wider block">Self-Powered Score</span>
                      <strong className="text-base sm:text-lg font-mono font-black text-[#10B981]">
                        {historyData.self_powered_percent}% Off-Grid
                      </strong>
                    </div>
                    <div className="h-8 w-8 rounded-full border-2 border-[#10B981] flex items-center justify-center bg-[#10B981]/15 text-[#10B981] text-xs font-bold font-mono">
                      ✓
                    </div>
                  </div>
                )}
              </div>

              {historyData && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                    <span className="text-[10px] uppercase font-bold text-[#FFB300] tracking-wider block">Solar Generated</span>
                    <p className="m-0 text-lg font-bold text-white font-mono">{historyData.total_solar_kwh} kWh</p>
                    <span className="text-[10px] text-[#81C784]">100% Clean DC</span>
                  </div>
                  <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                    <span className="text-[10px] uppercase font-bold text-[#64B5F6] tracking-wider block">Home Consumed</span>
                    <p className="m-0 text-lg font-bold text-white font-mono">{historyData.total_home_kwh} kWh</p>
                    <span className="text-[10px] text-[#8EAEC7]">HVAC & Lifestyle</span>
                  </div>
                  <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                    <span className="text-[10px] uppercase font-bold text-[#10B981] tracking-wider block">NEM Grid Export</span>
                    <p className="m-0 text-lg font-bold text-[#10B981] font-mono">+{historyData.total_grid_export_kwh} kWh</p>
                    <span className="text-[10px] text-[#81C784]">Utility NEM Credit</span>
                  </div>
                  <div className="rounded-xl bg-[#081827] p-3 border border-[#234567]">
                    <span className="text-[10px] uppercase font-bold text-[#38BDF8] tracking-wider block">Grid Imported</span>
                    <p className="m-0 text-lg font-bold text-white font-mono">{historyData.total_grid_import_kwh} kWh</p>
                    <span className="text-[10px] text-[#81C784]">Near Zero Cost</span>
                  </div>
                </div>
              )}

              {historyData && (
                <div className="space-y-4">
                  <div className="relative bg-[#07131F] rounded-xl p-4 border border-[#162B42] overflow-x-auto">
                    <svg viewBox="0 0 720 180" className="w-full min-w-[620px] h-48">
                      <line x1="40" y1="30" x2="700" y2="30" stroke="#162B42" strokeWidth="1" strokeDasharray="2 4" />
                      <line x1="40" y1="80" x2="700" y2="80" stroke="#162B42" strokeWidth="1" strokeDasharray="2 4" />
                      <line x1="40" y1="130" x2="700" y2="130" stroke="#243C56" strokeWidth="1" />

                      <text x="32" y="34" fill="#6A87A2" fontSize="9" textAnchor="end" fontFamily="monospace">8kW</text>
                      <text x="32" y="84" fill="#6A87A2" fontSize="9" textAnchor="end" fontFamily="monospace">4kW</text>
                      <text x="32" y="134" fill="#6A87A2" fontSize="9" textAnchor="end" fontFamily="monospace">0</text>

                      {(() => {
                        const pointsStr = historyData.points.map((p: any, idx: number) => {
                          const x = 50 + idx * 27;
                          const y = 130 - (p.soePercent / 100) * 100;
                          return `${x},${y}`;
                        }).join(' ');
                        return (
                          <polyline
                            fill="none"
                            stroke="#10B981"
                            strokeWidth="2"
                            strokeDasharray="4 2"
                            opacity="0.8"
                            points={pointsStr}
                          />
                        );
                      })()}

                      {historyData.points.map((p: any, idx: number) => {
                        const x = 45 + idx * 27;
                        const solarHeight = Math.min(100, (p.solarKwh / 9.2) * 100);
                        const homeHeight = Math.min(100, (p.homeKwh / 9.2) * 100);
                        const isSelected = selectedHistoryHour === idx;

                        return (
                          <g
                            key={p.hour}
                            className="cursor-pointer transition-opacity"
                            onClick={() => setSelectedHistoryHour(idx)}
                          >
                            {isSelected && (
                              <rect
                                x={x - 2}
                                y="10"
                                width="20"
                                height="135"
                                rx="4"
                                fill="#2A4A6D"
                                opacity="0.45"
                              />
                            )}

                            <rect
                              x={x}
                              y={130 - solarHeight}
                              width="7"
                              height={solarHeight}
                              rx="2"
                              fill="#FFB300"
                              opacity={isSelected ? 1 : 0.85}
                            />

                            <rect
                              x={x + 8}
                              y={130 - homeHeight}
                              width="7"
                              height={homeHeight}
                              rx="2"
                              fill="#38BDF8"
                              opacity={isSelected ? 1 : 0.75}
                            />

                            {idx % 3 === 0 && (
                              <text
                                x={x + 7}
                                y="152"
                                fill={isSelected ? '#FFFFFF' : '#8EAEC7'}
                                fontSize="9"
                                textAnchor="middle"
                                fontFamily="monospace"
                                fontWeight={isSelected ? 'bold' : 'normal'}
                              >
                                {p.hour}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-2 border-t border-[#162B42]">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5 text-white font-medium">
                          <span className="h-3 w-3 rounded-sm bg-[#FFB300]" /> Solar (kW)
                        </span>
                        <span className="flex items-center gap-1.5 text-white font-medium">
                          <span className="h-3 w-3 rounded-sm bg-[#38BDF8]" /> Home Load (kW)
                        </span>
                        <span className="flex items-center gap-1.5 text-[#10B981] font-medium">
                          <span className="h-0.5 w-4 bg-[#10B981] inline-block border-t border-dashed" /> Powerwall SOE (%)
                        </span>
                      </div>
                      <span className="text-[11px] text-[#6A87A2]">Click any hour to inspect exact energy exchange</span>
                    </div>
                  </div>

                  {selectedHistoryHour !== null && historyData.points[selectedHistoryHour] && (
                    <div className="rounded-xl bg-[#091D2F] p-4 border border-[#254A70] flex flex-wrap items-center justify-between gap-4 animate-fade-in">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-[#FF6B00]/20 px-2.5 py-0.5 text-xs font-bold text-[#FF8A2B]">
                            {historyData.points[selectedHistoryHour].hour}
                          </span>
                          <strong className="text-white text-sm">Telemetry Snapshot</strong>
                        </div>
                        <span className="text-xs text-[#8EAEC7] mt-0.5 block">
                          Battery State of Energy: <strong className="text-[#10B981] font-mono">{historyData.points[selectedHistoryHour].soePercent}%</strong>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">SOLAR</span>
                          <strong className="text-[#FFB300]">{historyData.points[selectedHistoryHour].solarKwh.toFixed(2)} kWh</strong>
                        </div>
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">HOME LOAD</span>
                          <strong className="text-[#38BDF8]">{historyData.points[selectedHistoryHour].homeKwh.toFixed(2)} kWh</strong>
                        </div>
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">BATTERY CHARGE</span>
                          <strong className="text-[#10B981]">+{historyData.points[selectedHistoryHour].batteryChargeKwh.toFixed(2)} kWh</strong>
                        </div>
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">BATTERY DISCHARGE</span>
                          <strong className="text-[#FF8A2B]">-{historyData.points[selectedHistoryHour].batteryDischargeKwh.toFixed(2)} kWh</strong>
                        </div>
                        <div className="bg-[#061421] px-3 py-1.5 rounded-lg border border-[#162D44]">
                          <span className="text-[#8EAEC7] text-[10px] block">GRID EXPORT</span>
                          <strong className="text-[#10B981]">+{historyData.points[selectedHistoryHour].gridExportKwh.toFixed(2)} kWh</strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Milestone Certificate Modal */}
      {selectedMilestoneDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-[#2B4E73] bg-[#0C1E32] p-6 text-left shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10B981]/20 text-[#10B981]">
                  <FileText className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="m-0 text-base font-bold text-white">{selectedMilestoneDoc.documentTitle}</h3>
                  <span className="text-[11px] font-mono text-[#64B5F6]">{selectedMilestoneDoc.documentId}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMilestoneDoc(null)}
                className="rounded-lg p-1.5 text-[#8FAEC7] hover:bg-white/10 hover:text-white transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                ✕
              </button>
            </div>

            <div className="my-4 space-y-3 text-xs text-[#C2D7EA]">
              <div className="rounded-xl bg-[#081827] p-3 border border-[#1A3859]">
                <strong className="text-white block mb-1">Official Summary:</strong>
                <p className="m-0 text-[#A8C4DF]">{selectedMilestoneDoc.documentSummary}</p>
              </div>

              <div>
                <strong className="text-white block mb-1.5">Verified Milestone Deliverables:</strong>
                <ul className="space-y-1 pl-4 list-disc text-[#8BA4BD]">
                  {selectedMilestoneDoc.deliverables.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 border-t border-white/10 flex justify-between items-center text-[11px] text-[#607D8B]">
                <span>Certified Sign-Off: <strong className="text-white">{selectedMilestoneDoc.signOffLead}</strong></span>
                <span className="font-mono">{selectedMilestoneDoc.date}</span>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSelectedMilestoneDoc(null)}
                className="w-full rounded-xl bg-[#1C3A5A] py-2.5 text-xs font-bold text-white hover:bg-[#28507B] transition cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2196F3]"
              >
                Close Certificate
              </button>
            </div>
          </div>
        </div>
      )}

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
              type="button"
              onClick={() => setShowQrModal(false)}
              className="mt-5 w-full rounded-xl bg-[#1C3A5A] py-2.5 text-xs font-bold text-white hover:bg-[#28507B] transition cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
