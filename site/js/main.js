(() => {
  'use strict';

  const FRAME_COUNT = 120;
  const HOLD_DURATION = 450; // ms the scroll freezes when a card first appears
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = () => window.innerWidth <= 768;
  // clientWidth excludes the reserved scrollbar gutter; innerWidth does not
  const viewW = () => document.documentElement.clientWidth;

  /* 1 Starscape */
  const starCanvas = document.getElementById('starscape');
  const starCtx = starCanvas.getContext('2d');
  let stars = [];

  function sizeStars() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // sub-pixel stars gain nothing past 2x
    starCanvas.width = viewW() * dpr;
    starCanvas.height = window.innerHeight * dpr;
    starCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seedStars() {
    stars = Array.from({ length: isMobile() ? 90 : 180 }, () => ({
      x: Math.random() * viewW(),
      y: Math.random() * window.innerHeight,
      radius: 0.3 + Math.random() * 1.2,
      baseOpacity: 0.2 + Math.random() * 0.6,
      driftX: (Math.random() - 0.5) * 0.04,
      driftY: (Math.random() - 0.5) * 0.02,
      twinkleSpeed: 0.0008 + Math.random() * 0.002,
      twinklePhase: Math.random() * Math.PI * 2,
    }));
  }

  function drawStars(animate) {
    const w = viewW();
    const h = window.innerHeight;
    starCtx.clearRect(0, 0, w, h);
    starCtx.fillStyle = '#fff';
    const now = Date.now();
    for (const s of stars) {
      if (animate) {
        s.x = (s.x + s.driftX + w) % w;
        s.y = (s.y + s.driftY + h) % h;
      }
      const twinkle = animate ? Math.sin(now * s.twinkleSpeed + s.twinklePhase) * 0.3 : 0;
      starCtx.beginPath();
      starCtx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      starCtx.globalAlpha = Math.max(0, s.baseOpacity + twinkle);
      starCtx.fill();
    }
    starCtx.globalAlpha = 1;
    if (animate) requestAnimationFrame(() => drawStars(true));
  }

  // Stars are decoration: start them after the hero has painted, never ahead of it
  const afterPaint = window.requestIdleCallback || ((fn) => setTimeout(fn, 300));
  window.addEventListener('load', () => afterPaint(() => {
    sizeStars();
    seedStars();
    drawStars(!reducedMotion);
  }, { timeout: 1500 }), { once: true });

  /* 2 Loader + 6 frame preloading */
  const loader = document.getElementById('loader');
  const loaderBar = document.getElementById('loaderBar');
  const canvas = document.getElementById('frameCanvas');
  const ctx = canvas.getContext('2d');
  const frames = [];
  let loadedFrames = 0;
  let currentFrame = -1;

  function hideLoader() {
    loader.style.opacity = '0';
    setTimeout(() => { loader.style.display = 'none'; }, 600);
  }

  function onFrameSettled() {
    loadedFrames++;
    loaderBar.style.width = `${(loadedFrames / FRAME_COUNT) * 100}%`;
    if (loadedFrames === FRAME_COUNT) {
      resizeCanvas();
      update();
      hideLoader();
    }
  }

  let preloadStarted = false;
  function preloadFrames() {
    if (preloadStarted) return;
    preloadStarted = true;
    for (let i = 1; i <= FRAME_COUNT; i++) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = onFrameSettled;
      img.onerror = onFrameSettled; // a missing frame must not hang the loader
      img.src = `frames/frame_${String(i).padStart(4, '0')}.jpg`;
      frames.push(img);
    }
  }

  if (reducedMotion) {
    // The animation degrades to its final frame (static <img>); nothing to preload.
    loader.style.display = 'none';
  } else {
    // 8.6MB of frames would starve the hero's fonts on a slow link, so the hero paints first:
    // frames start once fonts are in and the browser is idle, or as the visitor nears the section.
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
    document.fonts.ready.then(() => idle(preloadFrames, { timeout: 2500 }));
    new IntersectionObserver((entries, obs) => {
      if (entries.some((e) => e.isIntersecting)) { preloadFrames(); obs.disconnect(); }
    }, { rootMargin: '150% 0px' }).observe(document.querySelector('.scroll-animation'));
  }

  function drawFrame(index) {
    const img = frames[index];
    if (!img || !img.complete || !img.naturalWidth) return;
    const cw = canvas.width;
    const ch = canvas.height;
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const canvasRatio = cw / ch;
    let drawW;
    let drawH;

    if (!isMobile()) {
      // Desktop: cover-fit
      if (canvasRatio > imgRatio) { drawW = cw; drawH = cw / imgRatio; }
      else { drawH = ch; drawW = ch * imgRatio; }
    } else {
      // Mobile: zoomed contain-fit; the house sits centre-frame so a 1.9x zoom keeps it whole
      const zoom = 1.9;
      if (canvasRatio > imgRatio) { drawH = ch * zoom; drawW = drawH * imgRatio; }
      else { drawW = cw * zoom; drawH = drawW / imgRatio; }
    }
    ctx.fillStyle = '#050b1a';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, (cw - drawW) / 2, (ch - drawH) / 2, drawW, drawH);
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewW() * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${viewW()}px`;
    canvas.style.height = `${window.innerHeight}px`;
    if (currentFrame >= 0) drawFrame(currentFrame);
  }

  /* 7 Annotation cards + snap-stop */
  const section = document.querySelector('.scroll-animation');
  const cards = [...document.querySelectorAll('.annotation-card')];
  const zones = cards.map((card) => ({
    show: parseFloat(card.dataset.show),
    hide: parseFloat(card.dataset.hide),
    snapped: false,
  }));
  let isSnapping = false;

  function updateCards(progress) {
    cards.forEach((card, i) => {
      const zone = zones[i];
      const visible = progress >= zone.show && progress <= zone.hide;
      card.classList.toggle('visible', visible);
      if (visible && !zone.snapped && !isSnapping) {
        zone.snapped = true;
        isSnapping = true;
        document.documentElement.classList.add('snap-hold');
        setTimeout(() => {
          document.documentElement.classList.remove('snap-hold');
          isSnapping = false;
        }, HOLD_DURATION);
      }
      if (!visible) zone.snapped = false;
    });
  }

  /* 3 Progress bar, 4 navbar, 6 scroll-to-frame — one rAF per scroll burst */
  const progressBar = document.getElementById('scrollProgress');
  const navbar = document.getElementById('navbar');
  let ticking = false;

  function update() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progressBar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    navbar.classList.toggle('nav-scrolled', window.scrollY > 80);

    if (!reducedMotion && loadedFrames === FRAME_COUNT) {
      const rect = section.getBoundingClientRect();
      const scrollable = section.offsetHeight - window.innerHeight;
      const progress = Math.min(1, Math.max(0, -rect.top / scrollable));
      const frameIndex = Math.min(FRAME_COUNT - 1, Math.floor(progress * FRAME_COUNT));
      if (frameIndex !== currentFrame) {
        currentFrame = frameIndex;
        drawFrame(frameIndex);
      }
      updateCards(progress);
    }
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    sizeStars();
    seedStars();
    if (reducedMotion) drawStars(false);
    if (!reducedMotion) resizeCanvas();
    update();
  });

  /* 8 Specs count-up */
  const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const formatSpec = (value, item) => `${item.dataset.prefix || ''}${value}${item.dataset.suffix || ''}`;

  function countUp(item, duration = 2000) {
    const el = item.querySelector('.spec-number');
    const target = parseFloat(item.dataset.target);
    if (target === 0) return; // "$0" has nothing to count
    const decimals = target % 1 === 0 ? 0 : 1;
    const start = performance.now();
    el.classList.add('counting');
    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      el.textContent = formatSpec((easeOutExpo(t) * target).toFixed(decimals), item);
      if (t < 1) requestAnimationFrame(step);
      else {
        el.textContent = formatSpec(target.toFixed(decimals), item);
        el.classList.remove('counting');
      }
    }
    requestAnimationFrame(step);
  }

  if (!reducedMotion && 'IntersectionObserver' in window) {
    const specs = document.getElementById('specs');
    const specItems = [...specs.querySelectorAll('.spec-item')];
    specItems.forEach((item) => {
      if (parseFloat(item.dataset.target) !== 0) item.querySelector('.spec-number').textContent = formatSpec(0, item);
    });
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        specItems.forEach((item, i) => setTimeout(() => countUp(item), i * 200));
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.3 });
    observer.observe(specs);
  }

  /* 10 CTA confetti (opted in) */
  const confettiCanvas = document.getElementById('confetti');
  const confettiCtx = confettiCanvas.getContext('2d');
  const COLORS = ['#ffb81c', '#ffd36b', '#f4f6fb', '#5b7cff'];

  function burstConfetti(originX, originY) {
    const dpr = window.devicePixelRatio || 1;
    confettiCanvas.width = window.innerWidth * dpr;
    confettiCanvas.height = window.innerHeight * dpr;
    confettiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pieces = Array.from({ length: 140 }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
      const speed = 6 + Math.random() * 9;
      return {
        x: originX, y: originY,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 5, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    });
    const start = performance.now();
    function step(now) {
      const elapsed = now - start;
      confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      confettiCtx.globalAlpha = Math.max(0, 1 - elapsed / 1800);
      for (const p of pieces) {
        p.vy += 0.32;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        confettiCtx.save();
        confettiCtx.translate(p.x, p.y);
        confettiCtx.rotate(p.rot);
        confettiCtx.fillStyle = p.color;
        confettiCtx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        confettiCtx.restore();
      }
      if (elapsed < 1800) requestAnimationFrame(step);
      else confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
    requestAnimationFrame(step);
  }

  document.getElementById('ctaButton').addEventListener('click', (e) => {
    if (reducedMotion) return;
    const r = e.currentTarget.getBoundingClientRect();
    burstConfetti(r.left + r.width / 2, r.top + r.height / 2);
  });

  update();
})();
