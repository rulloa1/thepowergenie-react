import React, { useEffect, useId, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Compass,
  Eye,
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

export interface GenieWorldSyncState {
  weatherPreset?: 'sunny' | 'sunset' | 'overcast' | 'dusk';
  cameraYaw?: number;
  cameraPitch?: number;
  cameraX?: number;
  cameraY?: number;
  cameraZ?: number;
  steeringText?: string;
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

  // React to guest receiving syncState from host
  useEffect(() => {
    if (!syncState || !followHost) return;
    if (syncState.weatherPreset && syncState.weatherPreset !== weatherPreset) {
      setWeatherPreset(syncState.weatherPreset);
    }
    if (syncState.steeringText) {
      setHudNote(`Host steered world: "${syncState.steeringText}"`);
      const timer = setTimeout(() => setHudNote(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [syncState, followHost, weatherPreset]);

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

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

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
      }

      // Handle active key movement
      const speed = 0.12;
      if (activeKeys.has('key_w') || activeKeys.has('arrow_up')) {
        if (followHostRef.current && onToggleFollowHostRef.current) onToggleFollowHostRef.current(false);
        cameraX += Math.sin(cameraYaw) * speed;
        cameraZ += Math.cos(cameraYaw) * speed;
      }
      if (activeKeys.has('key_s') || activeKeys.has('arrow_down')) {
        if (followHostRef.current && onToggleFollowHostRef.current) onToggleFollowHostRef.current(false);
        cameraX -= Math.sin(cameraYaw) * speed;
        cameraZ -= Math.cos(cameraYaw) * speed;
      }
      if (activeKeys.has('key_a') || activeKeys.has('arrow_left')) {
        if (followHostRef.current && onToggleFollowHostRef.current) onToggleFollowHostRef.current(false);
        cameraX -= Math.cos(cameraYaw) * speed;
        cameraZ += Math.sin(cameraYaw) * speed;
      }
      if (activeKeys.has('key_d') || activeKeys.has('arrow_right')) {
        if (followHostRef.current && onToggleFollowHostRef.current) onToggleFollowHostRef.current(false);
        cameraX += Math.cos(cameraYaw) * speed;
        cameraZ -= Math.sin(cameraYaw) * speed;
      }
      if (activeKeys.has('space')) {
        if (followHostRef.current && onToggleFollowHostRef.current) onToggleFollowHostRef.current(false);
        cameraY = Math.min(6, cameraY + 0.08); // Elevate to view roof
      } else if (!followHostRef.current) {
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

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
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
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 rounded-full border border-slate-700/80 bg-slate-900/90 px-4 py-1.5 text-xs font-medium text-slate-200 shadow-xl backdrop-blur">
            {hudNote}
          </div>
        )}

        {/* On-Screen Keyboard / D-Pad Guide */}
        <div className="absolute bottom-20 left-4 z-20 flex flex-col gap-1 rounded-xl border border-slate-800/80 bg-slate-900/80 p-2.5 backdrop-blur text-[11px] text-slate-300">
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

        {/* Quick Atmosphere Preset Buttons */}
        <div className="absolute top-4 right-4 z-20 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => handleSteer('Golden hour sunset warm light across the solar roof')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-slate-800 backdrop-blur"
          >
            <Sun className="h-3.5 w-3.5 text-amber-400" /> Sunset Light
          </button>
          <button
            type="button"
            onClick={() => handleSteer('Inspect south roof Tier-1 solar panels close up')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 px-2.5 py-1 text-xs font-semibold text-sky-300 hover:bg-slate-800 backdrop-blur"
          >
            <Eye className="h-3.5 w-3.5 text-sky-400" /> Focus Panels
          </button>
          <button
            type="button"
            onClick={() => handleSteer('Walk up to Tesla Powerwall 3 battery on garage wall')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-slate-800 backdrop-blur"
          >
            <Zap className="h-3.5 w-3.5 text-emerald-400" /> Inspect Battery
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
