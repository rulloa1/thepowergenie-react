import React, { useEffect, useId, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  ArrowRight,
  BatteryCharging,
  ChevronRight,
  Compass,
  Eye,
  Gauge,
  Info,
  Layers,
  Maximize2,
  Minimize2,
  Radio,
  RotateCcw,
  Send,
  Sparkles,
  Sun,
  Video,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { lockPageScroll } from '../lib/scrollLock';
import { workflowApi } from './workflowApi';
import { Button, Notice, Spinner } from './ui';

const KEY_MAP: Record<string, string> = {
  KeyW: 'key_w',
  KeyA: 'key_a',
  KeyS: 'key_s',
  KeyD: 'key_d',
  ArrowUp: 'arrow_up',
  ArrowDown: 'arrow_down',
  ArrowLeft: 'arrow_left',
  ArrowRight: 'arrow_right',
  Space: 'space',
  KeyE: 'key_e',
};

export type GenieHotspotId = 'panels' | 'battery' | 'meter';

export interface GeniePointerState {
  x: number; // 0 to 1 relative
  y: number; // 0 to 1 relative
  active: boolean;
  label?: string;
}

export interface GenieWorldSyncState {
  weatherPreset?: 'sunny' | 'sunset' | 'overcast' | 'dusk';
  cameraYaw?: number;
  cameraPitch?: number;
  cameraX?: number;
  cameraY?: number;
  cameraZ?: number;
  steeringText?: string;
  focusedHotspot?: GenieHotspotId | null;
  pointer?: GeniePointerState | null;
}

export interface GenieWorldViewerProps {
  address?: string | null;
  leadName?: string | null;
  systemKw?: number | null;
  panelCount?: number | null;
  batteryName?: string | null;
  offsetPct?: number | null;
  initialPrompt?: string | null;
  inline?: boolean;
  syncState?: GenieWorldSyncState | null;
  onSyncChange?: (state: GenieWorldSyncState) => void;
  followHost?: boolean;
  onToggleFollowHost?: (following: boolean) => void;
  onClose: () => void;
}

export default function GenieWorldViewer({
  address,
  leadName,
  systemKw = 9.6,
  panelCount = 24,
  batteryName = '1x Tesla Powerwall 3 (13.5 kWh)',
  offsetPct = 102,
  initialPrompt,
  inline = false,
  syncState,
  onSyncChange,
  followHost = false,
  onToggleFollowHost,
  onClose,
}: GenieWorldViewerProps) {
  const safePanelCount = panelCount || 24;
  const safeSystemKw = systemKw || 9.6;
  const titleId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<'connecting' | 'live' | 'simulated' | 'error' | 'ended'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(120);
  const [steeringText, setSteeringText] = useState('');
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState(false);
  const [weatherPreset, setWeatherPreset] = useState<'sunny' | 'sunset' | 'overcast' | 'dusk'>('sunny');
  const [hudNote, setHudNote] = useState<string | null>('Use W/A/S/D or Arrow keys to walk around. Drag to look.');

  const [focusedHotspot, setFocusedHotspot] = useState<GenieHotspotId | null>(null);
  const [pointerDot, setPointerDot] = useState<GeniePointerState | null>(null);

  const focusedHotspotRef = useRef(focusedHotspot);
  focusedHotspotRef.current = focusedHotspot;

  const pointerDotRef = useRef(pointerDot);
  pointerDotRef.current = pointerDot;

  const targetCamRef = useRef<{ x: number; y: number; z: number; yaw: number; pitch: number } | null>(null);
  const screenPinsRef = useRef<{
    panels: { x: number; y: number; depth: number } | null;
    battery: { x: number; y: number; depth: number } | null;
    meter: { x: number; y: number; depth: number } | null;
  }>({ panels: null, battery: null, meter: null });

  // Live session holder
  const liveSessionRef = useRef<{
    send: (msg: any) => Promise<void>;
    complete: () => Promise<void>;
  } | null>(null);

  const syncStateRef = useRef(syncState);
  syncStateRef.current = syncState;

  const followHostRef = useRef(followHost);
  followHostRef.current = followHost;

  const onSyncChangeRef = useRef(onSyncChange);
  onSyncChangeRef.current = onSyncChange;

  const onToggleFollowHostRef = useRef(onToggleFollowHost);
  onToggleFollowHostRef.current = onToggleFollowHost;

  const energyFlow = React.useMemo(() => {
    switch (weatherPreset) {
      case 'sunset':
        return {
          solarKw: +(safeSystemKw * 0.28).toFixed(1),
          batteryKw: -1.8,
          homeKw: 3.8,
          gridKw: 0.0,
          statusLabel: 'Peak Demand · Battery Discharging',
        };
      case 'dusk':
        return {
          solarKw: 0.0,
          batteryKw: -3.2,
          homeKw: 3.2,
          gridKw: 0.0,
          statusLabel: 'Night Mode · 100% Stored Backup',
        };
      case 'overcast':
        return {
          solarKw: +(safeSystemKw * 0.35).toFixed(1),
          batteryKw: 0.8,
          homeKw: 2.6,
          gridKw: +(Math.max(0, safeSystemKw * 0.35 - 3.4)).toFixed(1),
          statusLabel: 'Diffuse Daylight Production',
        };
      case 'sunny':
      default:
        return {
          solarKw: +(safeSystemKw * 0.84).toFixed(1),
          batteryKw: 4.5,
          homeKw: 2.4,
          gridKw: +(Math.max(0, safeSystemKw * 0.84 - 2.4 - 4.5)).toFixed(1),
          statusLabel: 'Peak Production · Rapid Charging',
        };
    }
  }, [weatherPreset, safeSystemKw]);

  const HOTSPOT_INFO: Record<GenieHotspotId, {
    title: string;
    badge: string;
    badgeClass: string;
    specs: { label: string; value: string }[];
    description: string;
    cam: { x: number; y: number; z: number; yaw: number; pitch: number };
  }> = {
    panels: {
      title: 'Tier-1 Monocrystalline Solar Array',
      badge: `${safeSystemKw} kW DC Array`,
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      specs: [
        { label: 'System Capacity', value: `${safeSystemKw} kW DC` },
        { label: 'Module Count', value: `${safePanelCount} Monocrystalline Panels` },
        { label: 'Estimated Offset', value: `${offsetPct}% Net Production` },
        { label: 'Warranty Term', value: '25-Year Production Guarantee' },
      ],
      description: 'Optimized Texas high-heat coefficient with dark shingle architectural aesthetics and zero-roof-penetration flashing.',
      cam: { x: 0, y: 3.8, z: -6.0, yaw: 0, pitch: 0.38 },
    },
    battery: {
      title: 'Tesla Powerwall 3 Storage',
      badge: '13.5 kWh Usable',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      specs: [
        { label: 'Battery Chemistry', value: 'Lithium Iron Phosphate (LFP)' },
        { label: 'Continuous Output', value: '11.5 kW On-Grid / Backup' },
        { label: 'Switchover Latency', value: '< 20 ms Seamless Backup' },
        { label: 'Storm Watch', value: 'Automatic ERCOT Severe Weather Prep' },
      ],
      description: 'Integrated solar inverter and whole-home backup. Keeps air conditioning, refrigeration, and medical devices powered during outages.',
      cam: { x: 4.6, y: -0.2, z: -2.0, yaw: -1.15, pitch: 0.05 },
    },
    meter: {
      title: 'Bi-Directional Smart Net Meter',
      badge: 'CenterPoint / Oncor Sync',
      badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      specs: [
        { label: 'Metering Type', value: 'Bi-Directional Net Metering' },
        { label: 'Grid Export Tariff', value: '1:1 Energy Buyback Credits' },
        { label: 'Safety Disconnect', value: 'Rapid Shutdown & Islanding Guard' },
        { label: 'Interconnection', value: 'Utility Permission to Operate (PTO)' },
      ],
      description: 'Monitors net energy flow in real time. Surpluses are credited to the homeowner’s electric account.',
      cam: { x: 4.5, y: -0.4, z: -4.5, yaw: -1.45, pitch: 0.02 },
    },
  };

  const focusHotspot = (id: GenieHotspotId | null) => {
    setFocusedHotspot(id);
    if (id) {
      targetCamRef.current = HOTSPOT_INFO[id].cam;
      setHudNote(`Inspecting ${HOTSPOT_INFO[id].title}`);
      const timer = setTimeout(() => setHudNote(null), 3000);
    } else {
      targetCamRef.current = null;
    }

    onSyncChangeRef.current?.({
      weatherPreset,
      focusedHotspot: id,
      ...(id ? HOTSPOT_INFO[id].cam : {}),
    });
  };

  // React to guest receiving syncState from host
  useEffect(() => {
    if (!syncState) return;
    if (syncState.pointer !== undefined) {
      setPointerDot(syncState.pointer);
    }
    if (!followHost) return;
    if (syncState.weatherPreset && syncState.weatherPreset !== weatherPreset) {
      setWeatherPreset(syncState.weatherPreset);
    }
    if (syncState.focusedHotspot !== undefined && syncState.focusedHotspot !== focusedHotspot) {
      setFocusedHotspot(syncState.focusedHotspot);
      if (syncState.focusedHotspot) {
        targetCamRef.current = HOTSPOT_INFO[syncState.focusedHotspot].cam;
      } else {
        targetCamRef.current = null;
      }
    }
    if (syncState.steeringText) {
      setHudNote(`Host steered world: "${syncState.steeringText}"`);
      const timer = setTimeout(() => setHudNote(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [syncState, followHost, weatherPreset, focusedHotspot]);

  useEffect(() => {
    if (!inline) return lockPageScroll();
  }, [inline]);

  // 120s Bounded Session Countdown
  useEffect(() => {
    if (status !== 'live' && status !== 'simulated') return;
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setStatus('ended');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  // Compose default world prompt for solar consultation
  const defaultPrompt = initialPrompt ||
    `First-person ground and rooftop view walking around a sunlit Texas residential home at ${address || '4102 Westheimer Rd, Houston, TX 77027'}. ` +
    `Modern architecture with ${safePanelCount} high-efficiency dark monocrystalline solar panels (${safeSystemKw} kW DC) installed neatly on south and west roof facets. ` +
    `${batteryName} mounted on exterior wall. Clear blue sky, green lawn, warm sunlight. Audio: footsteps on concrete driveway, soft warm Texas summer breeze, faint distant birds.`;

  // Start Live Session or Simulated 3D Engine
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      setStatus('connecting');
      setErrorMessage(null);

      try {
        const sessionInfo = await workflowApi.genieSession(undefined, defaultPrompt);
        if (cancelled) return;

        if (sessionInfo.simulated || !sessionInfo.authToken || sessionInfo.authToken === 'simulated') {
          setStatus('simulated');
          return;
        }

        // Live Genie 4 WebRTC connection
        try {
          const { GoogleGenAI } = await import('@google/genai');
          const clientAi = new GoogleGenAI({
            apiKey: sessionInfo.authToken,
            apiVersion: 'v1beta',
          });

          const session = await (clientAi as any).interactions.connect(
            sessionInfo.interactionId,
            { transport: 'webrtc', api_version: 'v1beta' },
            { timeout_ms: 30000 },
          );

          if (cancelled) {
            void session.complete?.();
            return;
          }

          liveSessionRef.current = session;

          if (videoRef.current && session.transport?.setVideoElement) {
            session.transport.setVideoElement(videoRef.current);
          }

          // Send mandatory initial world_setup
          await session.send({
            event_type: 'world_setup',
            world_prompt: { text: defaultPrompt },
          });

          setStatus('live');

          // Consume background events
          void (async () => {
            try {
              for await (const event of session.receive()) {
                if (cancelled) break;
                if (event.event_type === 'error') {
                  console.warn('Genie 4 stream error:', event.error);
                } else if (event.event_type === 'interaction.completed') {
                  setStatus('ended');
                  break;
                }
              }
            } catch (err) {
              if (!cancelled) {
                console.warn('Genie 4 stream interrupted, falling back to simulated 3D:', err);
                setStatus('simulated');
              }
            }
          })();
        } catch (webrtcErr) {
          console.warn('Genie 4 WebRTC connection failed, running simulated 3D world:', webrtcErr);
          setStatus('simulated');
        }
      } catch (err) {
        console.warn('Genie 4 session API error, running simulated 3D world:', err);
        setStatus('simulated');
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (liveSessionRef.current) {
        void liveSessionRef.current.complete().catch(() => {});
        liveSessionRef.current = null;
      }
    };
  }, [defaultPrompt]);

  // Keyboard navigation controller
  const sendKeyAction = useCallback((action: 'key_down' | 'key_up', input: string) => {
    if (liveSessionRef.current) {
      void liveSessionRef.current.send({
        event_type: 'user_action',
        action,
        input,
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.repeat) return;
      const input = KEY_MAP[e.code];
      if (!input) return;
      e.preventDefault();
      setActiveKeys((prev) => new Set(prev).add(input));
      sendKeyAction('key_down', input);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const input = KEY_MAP[e.code];
      if (!input) return;
      e.preventDefault();
      setActiveKeys((prev) => {
        const next = new Set(prev);
        next.delete(input);
        return next;
      });
      sendKeyAction('key_up', input);
    };

    const onBlur = () => {
      setActiveKeys((prev) => {
        prev.forEach((k) => sendKeyAction('key_up', k));
        return new Set();
      });
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [sendKeyAction]);

  // Mid-session Prompt Steering
  const handleSteer = (text: string) => {
    if (!text.trim()) return;
    const trimmed = text.trim();
    setHudNote(`Steering world: "${trimmed}"`);
    setTimeout(() => setHudNote(null), 3500);

    if (liveSessionRef.current) {
      void liveSessionRef.current.send(trimmed).catch(console.error);
    }

    // Also update simulated engine atmosphere if active
    let newPreset = weatherPreset;
    if (/sunset|dusk|evening|golden hour/i.test(trimmed)) newPreset = 'sunset';
    else if (/night|dark|moon/i.test(trimmed)) newPreset = 'dusk';
    else if (/overcast|cloud|rain|storm/i.test(trimmed)) newPreset = 'overcast';
    else if (/sun|bright|day|clear/i.test(trimmed)) newPreset = 'sunny';

    if (newPreset !== weatherPreset) setWeatherPreset(newPreset);

    if (/battery|powerwall|storage/i.test(trimmed)) focusHotspot('battery');
    else if (/panel|array|solar|module/i.test(trimmed)) focusHotspot('panels');
    else if (/meter|utility|grid|buyback/i.test(trimmed)) focusHotspot('meter');

    // Notify sync state listeners
    onSyncChangeRef.current?.({
      weatherPreset: newPreset,
      steeringText: trimmed,
    });

    setSteeringText('');
  };

  // Simulated 3D Solar Environment Renderer
  useEffect(() => {
    if (status !== 'simulated') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let cameraX = 0;
    let cameraY = -1.2;
    let cameraZ = -9;
    let cameraYaw = 0;
    let cameraPitch = 0.08;
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let lastSyncTime = 0;

    const onMouseDown = (e: MouseEvent) => {
      if (followHostRef.current && onToggleFollowHostRef.current) {
        onToggleFollowHostRef.current(false);
      }
      targetCamRef.current = null;
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      cameraYaw += dx * 0.005;
      cameraPitch = Math.max(-0.6, Math.min(0.6, cameraPitch - dy * 0.005));
    };
    const onMouseUp = () => { isDragging = false; };

    const onCanvasClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const pins = screenPinsRef.current;
      if (!pins) return;

      for (const [id, pin] of Object.entries(pins) as [GenieHotspotId, { x: number; y: number; z: number } | null][]) {
        if (pin && Math.hypot(mx - pin.x, my - pin.y) < 32) {
          focusHotspot(id);
          return;
        }
      }
    };

    let touchStartX = 0;
    let touchStartY = 0;
    let lastPinchDist = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (followHostRef.current && onToggleFollowHostRef.current) onToggleFollowHostRef.current(false);
      targetCamRef.current = null;

      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
        isDragging = true;
      } else if (e.touches.length === 2) {
        lastPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - lastMouseX;
        const dy = e.touches[0].clientY - lastMouseY;
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
        cameraYaw += dx * 0.007;
        cameraPitch = Math.max(-0.6, Math.min(0.6, cameraPitch - dy * 0.007));
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const diff = dist - lastPinchDist;
        lastPinchDist = dist;
        cameraZ = Math.min(-2, Math.max(-20, cameraZ + diff * 0.03));
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      isDragging = false;
      if (e.changedTouches.length === 1) {
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        if (Math.hypot(endX - touchStartX, endY - touchStartY) < 14) {
          const rect = canvas.getBoundingClientRect();
          const mx = endX - rect.left;
          const my = endY - rect.top;
          const pins = screenPinsRef.current;
          if (pins) {
            for (const [id, pin] of Object.entries(pins) as [GenieHotspotId, { x: number; y: number; z: number } | null][]) {
              if (pin && Math.hypot(mx - pin.x, my - pin.y) < 32) {
                focusHotspot(id);
                return;
              }
            }
          }
        }
      }
    };

    let lastPointerTime = 0;
    const onPointerMove = (e: MouseEvent) => {
      if (!onSyncChangeRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      const now = performance.now();
      if (now - lastPointerTime > 45) {
        lastPointerTime = now;
        onSyncChangeRef.current({
          pointer: { x: relX, y: relY, active: true, label: 'Consultant' },
        });
      }
    };

    const onPointerLeave = () => {
      if (onSyncChangeRef.current) {
        onSyncChangeRef.current({ pointer: { x: 0, y: 0, active: false } });
      }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseleave', onPointerLeave);

    const render = () => {
      const w = canvas.width = canvas.clientWidth || 1280;
      const h = canvas.height = canvas.clientHeight || 720;

      // If following host and synced camera is active, smoothly lerp to host position
      if (followHostRef.current && syncStateRef.current) {
        const ss = syncStateRef.current;
        if (typeof ss.cameraX === 'number') cameraX += (ss.cameraX - cameraX) * 0.25;
        if (typeof ss.cameraY === 'number') cameraY += (ss.cameraY - cameraY) * 0.25;
        if (typeof ss.cameraZ === 'number') cameraZ += (ss.cameraZ - cameraZ) * 0.25;
        if (typeof ss.cameraYaw === 'number') cameraYaw += (ss.cameraYaw - cameraYaw) * 0.25;
        if (typeof ss.cameraPitch === 'number') cameraPitch += (ss.cameraPitch - cameraPitch) * 0.25;
      } else if (targetCamRef.current) {
        // Smoothly glide camera toward focused component
        cameraX += (targetCamRef.current.x - cameraX) * 0.12;
        cameraY += (targetCamRef.current.y - cameraY) * 0.12;
        cameraZ += (targetCamRef.current.z - cameraZ) * 0.12;
        cameraYaw += (targetCamRef.current.yaw - cameraYaw) * 0.12;
        cameraPitch += (targetCamRef.current.pitch - cameraPitch) * 0.12;
      }

      // Handle active key movement
      const speed = 0.12;
      if (activeKeys.has('key_w') || activeKeys.has('arrow_up')) {
        targetCamRef.current = null;
        if (followHostRef.current && onToggleFollowHostRef.current) onToggleFollowHostRef.current(false);
        cameraX += Math.sin(cameraYaw) * speed;
        cameraZ += Math.cos(cameraYaw) * speed;
      }
      if (activeKeys.has('key_s') || activeKeys.has('arrow_down')) {
        targetCamRef.current = null;
        if (followHostRef.current && onToggleFollowHostRef.current) onToggleFollowHostRef.current(false);
        cameraX -= Math.sin(cameraYaw) * speed;
        cameraZ -= Math.cos(cameraYaw) * speed;
      }
      if (activeKeys.has('key_a') || activeKeys.has('arrow_left')) {
        targetCamRef.current = null;
        if (followHostRef.current && onToggleFollowHostRef.current) onToggleFollowHostRef.current(false);
        cameraX -= Math.cos(cameraYaw) * speed;
        cameraZ += Math.sin(cameraYaw) * speed;
      }
      if (activeKeys.has('key_d') || activeKeys.has('arrow_right')) {
        targetCamRef.current = null;
        if (followHostRef.current && onToggleFollowHostRef.current) onToggleFollowHostRef.current(false);
        cameraX += Math.cos(cameraYaw) * speed;
        cameraZ -= Math.sin(cameraYaw) * speed;
      }
      if (activeKeys.has('space')) {
        targetCamRef.current = null;
        if (followHostRef.current && onToggleFollowHostRef.current) onToggleFollowHostRef.current(false);
        cameraY = Math.min(6, cameraY + 0.08); // Elevate to view roof
      } else if (!followHostRef.current && !targetCamRef.current) {
        cameraY = Math.max(-1.2, cameraY - 0.04); // Settle back to ground level
      }

      // Emit host camera sync if onSyncChange is active
      if (onSyncChangeRef.current && (isDragging || activeKeys.size > 0)) {
        const now = performance.now();
        if (now - lastSyncTime > 75) {
          lastSyncTime = now;
          onSyncChangeRef.current({
            weatherPreset,
            cameraYaw,
            cameraPitch,
            cameraX,
            cameraY,
            cameraZ,
          });
        }
      }

      // Sky Background according to weather preset
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      if (weatherPreset === 'sunset') {
        skyGrad.addColorStop(0, '#f97316');
        skyGrad.addColorStop(0.35, '#fb923c');
        skyGrad.addColorStop(0.7, '#fef08a');
        skyGrad.addColorStop(1, '#64748b');
      } else if (weatherPreset === 'overcast') {
        skyGrad.addColorStop(0, '#64748b');
        skyGrad.addColorStop(0.6, '#94a3b8');
        skyGrad.addColorStop(1, '#cbd5e1');
      } else if (weatherPreset === 'dusk') {
        skyGrad.addColorStop(0, '#0f172a');
        skyGrad.addColorStop(0.5, '#1e293b');
        skyGrad.addColorStop(1, '#334155');
      } else {
        skyGrad.addColorStop(0, '#0284c7');
        skyGrad.addColorStop(0.55, '#38bdf8');
        skyGrad.addColorStop(0.9, '#bae6fd');
        skyGrad.addColorStop(1, '#f0f9ff');
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Sun disc
      const sunY = weatherPreset === 'sunset' ? h * 0.45 : h * 0.2;
      const sunX = w * 0.7;
      const sunGrad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 140);
      sunGrad.addColorStop(0, weatherPreset === 'sunset' ? '#ffedd5' : '#ffffff');
      sunGrad.addColorStop(0.2, weatherPreset === 'sunset' ? '#fde047' : '#fef08a');
      sunGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 140, 0, Math.PI * 2);
      ctx.fill();

      // Ground Lawn & Driveway
      const horizonY = h * 0.52 + cameraPitch * h * 0.8;
      const groundGrad = ctx.createLinearGradient(0, horizonY, 0, h);
      groundGrad.addColorStop(0, weatherPreset === 'sunset' ? '#3f6212' : '#15803d');
      groundGrad.addColorStop(1, weatherPreset === 'sunset' ? '#14532d' : '#166534');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, horizonY, w, h - horizonY);

      // Concrete Driveway & Path
      ctx.fillStyle = weatherPreset === 'sunset' ? '#a8a29e' : '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(w * 0.25, h);
      ctx.lineTo(w * 0.45, horizonY + (h - horizonY) * 0.4);
      ctx.lineTo(w * 0.65, horizonY + (h - horizonY) * 0.4);
      ctx.lineTo(w * 0.75, h);
      ctx.closePath();
      ctx.fill();

      // 3D Projection Helper
      const project = (x: number, y: number, z: number) => {
        // Translate relative to camera
        const dx = x - cameraX;
        const dy = y - cameraY;
        const dz = z - cameraZ;

        // Rotate around yaw
        const rx = dx * Math.cos(-cameraYaw) - dz * Math.sin(-cameraYaw);
        const rz = dx * Math.sin(-cameraYaw) + dz * Math.cos(-cameraYaw);

        // Rotate around pitch
        const ry = dy * Math.cos(cameraPitch) - rz * Math.sin(cameraPitch);
        const pz = dy * Math.sin(cameraPitch) + rz * Math.cos(cameraPitch);

        if (pz <= 0.1) return null;
        const fov = 650;
        const px = (rx / pz) * fov + w / 2;
        const py = (-ry / pz) * fov + h / 2;
        return { x: px, y: py, depth: pz };
      };

      // Draw Home Exterior
      // Body corners
      const hx = 0;
      const hz = 0;
      const hw = 3.6;
      const hh = 2.4;
      const hd = 3.2;

      const pFrontBL = project(hx - hw, 0, hz - hd);
      const pFrontBR = project(hx + hw, 0, hz - hd);
      const pFrontTL = project(hx - hw, hh, hz - hd);
      const pFrontTR = project(hx + hw, hh, hz - hd);

      const pBackBL = project(hx - hw, 0, hz + hd);
      const pBackBR = project(hx + hw, 0, hz + hd);
      const pBackTL = project(hx - hw, hh, hz + hd);
      const pBackTR = project(hx + hw, hh, hz + hd);

      // Roof Ridge & Peaks (Texas Hip Roof)
      const ridgeY = hh + 1.8;
      const pRoofL = project(hx - hw * 0.65, ridgeY, hz);
      const pRoofR = project(hx + hw * 0.65, ridgeY, hz);

      // Draw Main Walls
      if (pFrontBL && pFrontBR && pFrontTL && pFrontTR) {
        // Front wall
        ctx.fillStyle = weatherPreset === 'sunset' ? '#fed7aa' : '#f8fafc';
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pFrontBL.x, pFrontBL.y);
        ctx.lineTo(pFrontBR.x, pFrontBR.y);
        ctx.lineTo(pFrontTR.x, pFrontTR.y);
        ctx.lineTo(pFrontTL.x, pFrontTL.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Front Door & Windows
        const pDoorBL = project(hx - 0.5, 0, hz - hd);
        const pDoorBR = project(hx + 0.5, 0, hz - hd);
        const pDoorTL = project(hx - 0.5, 1.4, hz - hd);
        const pDoorTR = project(hx + 0.5, 1.4, hz - hd);
        if (pDoorBL && pDoorBR && pDoorTL && pDoorTR) {
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.moveTo(pDoorBL.x, pDoorBL.y);
          ctx.lineTo(pDoorBR.x, pDoorBR.y);
          ctx.lineTo(pDoorTR.x, pDoorTR.y);
          ctx.lineTo(pDoorTL.x, pDoorTL.y);
          ctx.closePath();
          ctx.fill();
        }

        // Tesla Powerwall 3 Mounted on Right Garage Wall
        const pPowBL = project(hx + hw + 0.05, 0.4, hz - hd * 0.6);
        const pPowBR = project(hx + hw + 0.05, 0.4, hz - hd * 0.2);
        const pPowTL = project(hx + hw + 0.05, 1.6, hz - hd * 0.6);
        const pPowTR = project(hx + hw + 0.05, 1.6, hz - hd * 0.2);
        if (pPowBL && pPowBR && pPowTL && pPowTR) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(pPowBL.x, pPowBL.y);
          ctx.lineTo(pPowBR.x, pPowBR.y);
          ctx.lineTo(pPowTR.x, pPowTR.y);
          ctx.lineTo(pPowTL.x, pPowTL.y);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#cbd5e1';
          ctx.stroke();

          // Tesla Logo & Glowing Status Light
          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(pPowTL.x + (pPowTR.x - pPowTL.x) * 0.5, pPowTL.y + 12, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw Roof Facets & Solar Panels
      if (pFrontTL && pFrontTR && pRoofL && pRoofR) {
        // South Front Roof Plane
        ctx.fillStyle = weatherPreset === 'sunset' ? '#451a03' : '#334155';
        ctx.beginPath();
        ctx.moveTo(pFrontTL.x, pFrontTL.y);
        ctx.lineTo(pFrontTR.x, pFrontTR.y);
        ctx.lineTo(pRoofR.x, pRoofR.y);
        ctx.lineTo(pRoofL.x, pRoofL.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.stroke();

        // Render Solar Panels Array on South Roof Plane
        const rows = 3;
        const cols = Math.min(8, Math.ceil(safePanelCount / rows));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const u1 = (c + 0.15) / cols;
            const u2 = (c + 0.85) / cols;
            const v1 = (r + 0.15) / rows;
            const v2 = (r + 0.85) / rows;

            const lerp3 = (tU: number, tV: number) => {
              const bX = hx - hw + tU * hw * 2;
              const rX = hx - hw * 0.65 + tU * (hw * 1.3);
              const x = bX * (1 - tV) + rX * tV;
              const y = hh * (1 - tV) + ridgeY * tV + 0.04; // Slightly offset above shingle
              const z = (hz - hd) * (1 - tV) + hz * tV;
              return project(x, y, z);
            };

            const p1 = lerp3(u1, v1);
            const p2 = lerp3(u2, v1);
            const p3 = lerp3(u2, v2);
            const p4 = lerp3(u1, v2);

            if (p1 && p2 && p3 && p4) {
              // Solar Cell Dark Blue/Black with Glass Glare
              ctx.fillStyle = weatherPreset === 'sunset' ? '#1e1b4b' : '#0a192f';
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.lineTo(p3.x, p3.y);
              ctx.lineTo(p4.x, p4.y);
              ctx.closePath();
              ctx.fill();

              // Tier-1 Anti-Reflective Silver Frame
              ctx.strokeStyle = '#94a3b8';
              ctx.lineWidth = 1;
              ctx.stroke();

              // Subtle Grid Busbars
              ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
              ctx.beginPath();
              ctx.moveTo((p1.x + p4.x) / 2, (p1.y + p4.y) / 2);
              ctx.lineTo((p2.x + p3.x) / 2, (p2.y + p3.y) / 2);
              ctx.stroke();
            }
          }
        }
      }

      // Compass Rose in Top-Right
      const compassX = w - 65;
      const compassY = 70;
      ctx.save();
      ctx.translate(compassX, compassY);
      ctx.rotate(-cameraYaw);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();
      // North needle
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(6, 0);
      ctx.lineTo(-6, 0);
      ctx.closePath();
      ctx.fill();
      // South needle
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(0, 20);
      ctx.lineTo(6, 0);
      ctx.lineTo(-6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('N', 0, -23);
      ctx.restore();

      // Project 3D Component Coordinates onto 2D Screen
      const pinPanels = project(0, hh + 0.8, hz - hd * 0.5);
      const pinBattery = project(hx + hw + 0.15, 1.1, hz - hd * 0.4);
      const pinMeter = project(hx + hw + 0.15, 0.85, hz - hd * 0.85);

      screenPinsRef.current = {
        panels: pinPanels,
        battery: pinBattery,
        meter: pinMeter,
      };

      // Draw Animated Power Flow Conduits & Flow Lines
      const animSec = Date.now() / 1000;
      if (pinPanels && pinBattery && pinPanels.depth > 0 && pinBattery.depth > 0) {
        ctx.save();
        ctx.strokeStyle = weatherPreset === 'dusk' ? 'rgba(52, 211, 153, 0.5)' : 'rgba(251, 191, 36, 0.6)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = -animSec * 28;
        ctx.beginPath();
        ctx.moveTo(pinPanels.x, pinPanels.y);
        const pConduit = project(hx + hw + 0.1, hh, hz - hd * 0.4);
        if (pConduit) ctx.lineTo(pConduit.x, pConduit.y);
        ctx.lineTo(pinBattery.x, pinBattery.y);
        ctx.stroke();
        ctx.restore();
      }

      if (pinBattery && pinMeter && pinBattery.depth > 0 && pinMeter.depth > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -animSec * 20;
        ctx.beginPath();
        ctx.moveTo(pinBattery.x, pinBattery.y);
        ctx.lineTo(pinMeter.x, pinMeter.y);
        ctx.stroke();
        ctx.restore();
      }

      // Draw Interactive 3D Component Beacons
      const drawPin = (pin: { x: number; y: number; depth: number } | null, id: GenieHotspotId, color: string, label: string) => {
        if (!pin || pin.depth <= 0.4) return;
        const isSelected = focusedHotspotRef.current === id;
        const pulse = Math.sin(Date.now() / 250) * 3;

        ctx.save();
        ctx.beginPath();
        ctx.arc(pin.x, pin.y, 15 + pulse, 0, Math.PI * 2);
        ctx.fillStyle = color + '22';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pin.x, pin.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#ffffff' : color;
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = 'bold 11px system-ui, sans-serif';
        const tw = ctx.measureText(label).width;
        const pillW = tw + 16;
        const pillH = 22;
        const pillX = pin.x + 14;
        const pillY = pin.y - 11;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 6);
        ctx.fill();
        ctx.strokeStyle = isSelected ? color : 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = isSelected ? '#ffffff' : color;
        ctx.fillText(label, pillX + 8, pillY + 15);
        ctx.restore();
      };

      drawPin(pinPanels, 'panels', '#f59e0b', `☀️ ${safeSystemKw} kW Array`);
      drawPin(pinBattery, 'battery', '#10b981', '⚡ Powerwall 3');
      drawPin(pinMeter, 'meter', '#38bdf8', '📊 Net Meter');

      // Draw Synchronized Consultant Laser Pointer
      if (pointerDotRef.current?.active) {
        const px = pointerDotRef.current.x * w;
        const py = pointerDotRef.current.y * h;
        const pPulse = Math.sin(Date.now() / 150) * 4;

        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, 14 + pPulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        const tag = pointerDotRef.current.label || 'Consultant';
        ctx.font = 'bold 10px system-ui, sans-serif';
        const tagW = ctx.measureText(tag).width + 12;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.beginPath();
        ctx.roundRect(px + 8, py - 18, tagW, 18, 4);
        ctx.fill();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#fecaca';
        ctx.fillText(tag, px + 14, py - 5);
        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('mousemove', onPointerMove);
      canvas.removeEventListener('mouseleave', onPointerLeave);
    };
  }, [status, activeKeys, weatherPreset, safePanelCount, safeSystemKw]);

  const handleStopAndClose = async () => {
    if (liveSessionRef.current) {
      try {
        await liveSessionRef.current.complete();
      } catch {}
      liveSessionRef.current = null;
    }
    onClose();
  };

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = String(timeRemaining % 60).padStart(2, '0');

  const content = (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => e.stopPropagation()}
      className={
        inline
          ? 'relative flex h-full w-full flex-col overflow-hidden bg-slate-950 font-[family:var(--sw-font-body)] text-white select-none'
          : 'fixed inset-0 z-[96] flex flex-col bg-slate-950 font-[family:var(--sw-font-body)] text-white select-none'
      }
    >
      {/* Top Header Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <Sparkles className="h-4 w-4 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 id={titleId} className="m-0 text-sm font-bold tracking-tight text-white sm:text-base">
                Genie 4 Live World — {leadName || address || 'Interactive 3D Walkthrough'}
              </h2>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                status === 'live'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : status === 'simulated'
                  ? 'bg-sky-500/20 text-sky-300'
                  : 'bg-amber-500/20 text-amber-300'
              }`}>
                {status === 'live' ? 'Live WebRTC · 24 fps' : status === 'simulated' ? '3D Solar Engine' : 'Connecting...'}
              </span>
            </div>
            <p className="m-0 text-xs text-slate-400">
              {safeSystemKw} kW DC ({safePanelCount} panels) · {batteryName} · {offsetPct}% offset
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Guest Follow Host / Free Explore Toggle */}
          {onToggleFollowHost && (
            <button
              type="button"
              onClick={() => onToggleFollowHost(!followHost)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold backdrop-blur border transition-all ${
                followHost
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700/80'
              }`}
              title={followHost ? 'Click to explore freely' : 'Click to follow consultant'}
            >
              <Radio className={`h-3.5 w-3.5 ${followHost ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">{followHost ? 'Following Consultant' : 'Free Explore'}</span>
            </button>
          )}

          {/* 120s Bounded Session Countdown */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-mono font-bold text-amber-300">
            <Radio className="h-3.5 w-3.5 animate-pulse text-amber-400" />
            <span>{minutes}:{seconds}</span>
          </div>

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="hidden h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 sm:inline-flex"
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          <Button
            type="button"
            variant="danger"
            onClick={handleStopAndClose}
            className="min-h-9 px-3 text-xs font-semibold"
          >
            <X className="h-4 w-4 mr-1" /> Complete & Exit
          </Button>
        </div>
      </header>

      {/* Main 16:9 Viewport Stage */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
        {status === 'connecting' && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 gap-3">
            <Spinner className="h-8 w-8 text-amber-400" />
            <p className="text-sm font-semibold text-slate-200">
              Initializing Genie 4 interactive world stream...
            </p>
            <p className="text-xs text-slate-400 max-w-md text-center">
              Targeting models/genie-4 via Live Interactions v1beta. Setting up 16:9 24 fps stream and synchronized Foley audio.
            </p>
          </div>
        )}

        {/* Video Element for Live WebRTC Stream */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`h-full w-full object-contain ${status === 'live' ? 'block' : 'hidden'}`}
        />

        {/* Canvas for Interactive 3D Procedural Engine */}
        <canvas
          ref={canvasRef}
          className={`h-full w-full cursor-grab active:cursor-grabbing ${status === 'simulated' ? 'block' : 'hidden'}`}
        />

        {/* HUD Notification Toast */}
        {hudNote && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 rounded-full border border-slate-700/80 bg-slate-900/90 px-4 py-1.5 text-xs font-medium text-slate-200 shadow-xl backdrop-blur animate-in fade-in zoom-in-95">
            {hudNote}
          </div>
        )}

        {/* Live Energy Flow Telemetry HUD (Top-Left) */}
        <div className="absolute top-4 left-4 z-20 hidden sm:flex flex-col gap-1.5 rounded-xl border border-slate-800/80 bg-slate-900/85 p-3 backdrop-blur shadow-2xl pointer-events-auto">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-400">
              <Zap className="h-3.5 w-3.5 fill-amber-400/20" /> Live Energy Flow
            </span>
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              ● Self-Powered
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-0.5 text-center">
            <div className="rounded-lg bg-slate-950/60 p-1.5 border border-amber-500/20">
              <div className="text-[10px] text-slate-400">Solar Gen</div>
              <div className="text-xs font-bold text-amber-300">{(safeSystemKw * 0.78).toFixed(1)} kW</div>
            </div>
            <div className="rounded-lg bg-slate-950/60 p-1.5 border border-emerald-500/20">
              <div className="text-[10px] text-slate-400">Powerwall</div>
              <div className="text-xs font-bold text-emerald-300">+3.1 kW</div>
            </div>
            <div className="rounded-lg bg-slate-950/60 p-1.5 border border-sky-500/20">
              <div className="text-[10px] text-slate-400">Net Export</div>
              <div className="text-xs font-bold text-sky-300">+2.8 kW</div>
            </div>
          </div>
        </div>

        {/* Focused Component Telemetry Card (Bottom-Right) */}
        {focusedHotspot && HOTSPOT_INFO[focusedHotspot] && (
          <div className="absolute bottom-20 right-4 z-20 max-w-sm w-full rounded-2xl border border-slate-700/80 bg-slate-900/90 p-4 shadow-2xl backdrop-blur transition-all animate-in fade-in slide-in-from-bottom-2 pointer-events-auto">
            <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${
                    focusedHotspot === 'panels' ? 'bg-amber-400' : focusedHotspot === 'battery' ? 'bg-emerald-400' : 'bg-sky-400'
                  }`} />
                  <h3 className="m-0 text-sm font-bold text-white">
                    {HOTSPOT_INFO[focusedHotspot].title}
                  </h3>
                </div>
                <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${HOTSPOT_INFO[focusedHotspot].badgeClass}`}>
                  {HOTSPOT_INFO[focusedHotspot].badge}
                </span>
              </div>
              <button
                type="button"
                onClick={() => focusHotspot(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                title="Dismiss details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              {HOTSPOT_INFO[focusedHotspot].description}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-950/70 p-2.5 border border-slate-800/80">
              {HOTSPOT_INFO[focusedHotspot].specs.map((spec, idx) => (
                <div key={idx} className="flex flex-col">
                  <span className="text-[10px] text-slate-400">{spec.label}</span>
                  <span className="text-xs font-semibold text-slate-100">{spec.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 pt-1">
              <span className="text-[10px] text-slate-400">
                Click beacon or drag to orbit
              </span>
              <button
                type="button"
                onClick={() => {
                  const list: GenieHotspotId[] = ['panels', 'battery', 'meter'];
                  const nextIdx = (list.indexOf(focusedHotspot) + 1) % list.length;
                  focusHotspot(list[nextIdx]);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
              >
                Next Component <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* On-Screen Keyboard / D-Pad Guide */}
        <div className="absolute bottom-20 left-4 z-20 flex flex-col gap-1 rounded-xl border border-slate-800/80 bg-slate-900/80 p-2.5 backdrop-blur text-[11px] text-slate-300 pointer-events-auto">
          <div className="flex items-center justify-between font-bold text-slate-400 text-[10px] uppercase">
            <span>Controls</span>
            <span>WASD / Arrows</span>
          </div>
          <div className="grid grid-cols-3 gap-1 w-24 text-center font-bold">
            <span />
            <button
              type="button"
              onMouseDown={() => { setActiveKeys((p) => new Set(p).add('key_w')); sendKeyAction('key_down', 'key_w'); }}
              onMouseUp={() => { setActiveKeys((p) => { const n = new Set(p); n.delete('key_w'); return n; }); sendKeyAction('key_up', 'key_w'); }}
              className={`rounded border py-1 ${activeKeys.has('key_w') ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 border-slate-700'}`}
            >
              W
            </button>
            <span />
            <button
              type="button"
              onMouseDown={() => { setActiveKeys((p) => new Set(p).add('key_a')); sendKeyAction('key_down', 'key_a'); }}
              onMouseUp={() => { setActiveKeys((p) => { const n = new Set(p); n.delete('key_a'); return n; }); sendKeyAction('key_up', 'key_a'); }}
              className={`rounded border py-1 ${activeKeys.has('key_a') ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 border-slate-700'}`}
            >
              A
            </button>
            <button
              type="button"
              onMouseDown={() => { setActiveKeys((p) => new Set(p).add('key_s')); sendKeyAction('key_down', 'key_s'); }}
              onMouseUp={() => { setActiveKeys((p) => { const n = new Set(p); n.delete('key_s'); return n; }); sendKeyAction('key_up', 'key_s'); }}
              className={`rounded border py-1 ${activeKeys.has('key_s') ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 border-slate-700'}`}
            >
              S
            </button>
            <button
              type="button"
              onMouseDown={() => { setActiveKeys((p) => new Set(p).add('key_d')); sendKeyAction('key_down', 'key_d'); }}
              onMouseUp={() => { setActiveKeys((p) => { const n = new Set(p); n.delete('key_d'); return n; }); sendKeyAction('key_up', 'key_d'); }}
              className={`rounded border py-1 ${activeKeys.has('key_d') ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 border-slate-700'}`}
            >
              D
            </button>
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
            <span>[Space] Orbit Roof</span>
            <span>Drag Look</span>
          </div>
        </div>

        {/* Quick Atmosphere & Component Preset Buttons */}
        <div className="absolute top-4 right-4 z-20 flex flex-col gap-1.5 pointer-events-auto">
          <button
            type="button"
            onClick={() => handleSteer(weatherPreset === 'sunny' ? 'Golden hour sunset warm light across the solar roof' : 'Clear bright blue sky sunny day')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-slate-800 backdrop-blur"
          >
            <Sun className="h-3.5 w-3.5 text-amber-400" />
            <span>{weatherPreset === 'sunset' ? 'Clear Sun' : 'Sunset Light'}</span>
          </button>
          <button
            type="button"
            onClick={() => focusHotspot(focusedHotspot === 'panels' ? null : 'panels')}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold backdrop-blur transition-all ${
              focusedHotspot === 'panels'
                ? 'bg-amber-500/25 text-amber-200 border-amber-400 ring-1 ring-amber-400/50'
                : 'border-slate-700/80 bg-slate-900/80 text-sky-300 hover:bg-slate-800'
            }`}
          >
            <Eye className="h-3.5 w-3.5 text-sky-400" /> ☀️ Solar Array
          </button>
          <button
            type="button"
            onClick={() => focusHotspot(focusedHotspot === 'battery' ? null : 'battery')}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold backdrop-blur transition-all ${
              focusedHotspot === 'battery'
                ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400 ring-1 ring-emerald-400/50'
                : 'border-slate-700/80 bg-slate-900/80 text-emerald-300 hover:bg-slate-800'
            }`}
          >
            <Zap className="h-3.5 w-3.5 text-emerald-400" /> ⚡ Powerwall 3
          </button>
          <button
            type="button"
            onClick={() => focusHotspot(focusedHotspot === 'meter' ? null : 'meter')}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold backdrop-blur transition-all ${
              focusedHotspot === 'meter'
                ? 'bg-sky-500/25 text-sky-200 border-sky-400 ring-1 ring-sky-400/50'
                : 'border-slate-700/80 bg-slate-900/80 text-sky-300 hover:bg-slate-800'
            }`}
          >
            <Activity className="h-3.5 w-3.5 text-sky-400" /> 📊 Smart Meter
          </button>
        </div>
      </div>

      {/* Bottom Steering & Action Bar */}
      <footer className="border-t border-slate-800 bg-slate-900 px-4 py-2.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSteer(steeringText);
          }}
          className="flex items-center gap-2 max-w-4xl mx-auto"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={steeringText}
              onChange={(e) => setSteeringText(e.target.value)}
              placeholder="Steer the world mid-session (e.g. 'golden hour sunset', 'inspect battery', 'walk toward front door')..."
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 pr-10 text-xs sm:text-sm text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>
          <button
            type="submit"
            disabled={!steeringText.trim()}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" /> Steer World
          </button>
        </form>
      </footer>
    </div>
  );

  return inline ? content : createPortal(content, document.body);
}
