/* Grove — landing. Particle figure + camera choreography (three.js), plus the page's small interactions. */
import * as THREE from 'three';

// ================= Environment =================
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouchDevice = window.matchMedia('(hover: none), (pointer: coarse)').matches;
const isSmall = () => window.innerWidth < 900;

// Restrained palette: mostly dim bone light, ember as the signal, a little moss and gold. Weighted.
const PALETTE = [
  { c: [0.96, 0.96, 0.95], w: 0.58 }, // bone
  { c: [1.00, 0.42, 0.29], w: 0.22 }, // ember
  { c: [0.20, 0.83, 0.60], w: 0.13 }, // moss
  { c: [1.00, 0.76, 0.30], w: 0.07 }, // gold
];
function pickColor() {
  let r = Math.random();
  for (const p of PALETTE) { if ((r -= p.w) <= 0) return p.c; }
  return PALETTE[0].c;
}

// ================= Vector math =================
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a) => Math.sqrt(dot(a, a));
const normalize = (a) => { const l = length(a); return l < 1e-9 ? [0, 0, 0] : scale(a, 1 / l); };
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];

function sampleCapsuleSurface(A, B, rA, rB, tRand, angleRand) {
  const center = lerp3(A, B, tRand);
  const dir = normalize(sub(B, A));
  const upGuess = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const right = normalize(cross(upGuess, dir));
  const trueUp = cross(dir, right);
  const radius = lerp(rA, rB, tRand);
  const offset = add(scale(right, Math.cos(angleRand) * radius), scale(trueUp, Math.sin(angleRand) * radius));
  return add(center, offset);
}
function sampleSphereSurface(center, radius, u1, u2) {
  const theta = u1 * Math.PI * 2, phi = Math.acos(u2 * 2 - 1);
  return [center[0] + radius * Math.sin(phi) * Math.cos(theta), center[1] + radius * Math.cos(phi), center[2] + radius * Math.sin(phi) * Math.sin(theta)];
}

// ================= Humanoid skeleton =================
const SKELETON = {
  headCenter: [0, 3.72, 0], headRadius: 0.60,
  neck: { A: [0, 2.62, 0], B: [0, 3.02, 0], rA: 0.24, rB: 0.20 },
  torso: { A: [0, -0.35, 0], B: [0, 2.62, 0], rA: 0.56, rB: 0.74 },
  leftUpperArm: { A: [0.86, 2.42, 0], B: [1.62, 1.28, 0.12], rA: 0.27, rB: 0.20 },
  rightUpperArm: { A: [-0.86, 2.42, 0], B: [-1.62, 1.28, 0.12], rA: 0.27, rB: 0.20 },
  leftForearm: { A: [1.62, 1.28, 0.12], B: [2.05, 0.15, 0.35], rA: 0.20, rB: 0.13 },
  rightForearm: { A: [-1.62, 1.28, 0.12], B: [-2.05, 0.15, 0.35], rA: 0.20, rB: 0.13 },
  leftThigh: { A: [0.46, -0.35, 0], B: [0.42, -2.55, 0], rA: 0.42, rB: 0.30 },
  rightThigh: { A: [-0.46, -0.35, 0], B: [-0.42, -2.55, 0], rA: 0.42, rB: 0.30 },
  leftShin: { A: [0.42, -2.55, 0], B: [0.48, -4.65, 0], rA: 0.28, rB: 0.18 },
  rightShin: { A: [-0.42, -2.55, 0], B: [-0.48, -4.65, 0], rA: 0.28, rB: 0.18 },
  leftFoot: { A: [0.48, -4.65, 0], B: [0.48, -4.65, 0.55], rA: 0.19, rB: 0.13 },
  rightFoot: { A: [-0.48, -4.65, 0], B: [-0.48, -4.65, 0.55], rA: 0.19, rB: 0.13 },
};
const BUDGET = { head: 260, neck: 40, torso: 560, leftUpperArm: 140, rightUpperArm: 140, leftForearm: 110, rightForearm: 110, leftThigh: 260, rightThigh: 260, leftShin: 220, rightShin: 220, leftFoot: 70, rightFoot: 70 };

function generateFigurePositions(scaleFactor = 1) {
  const points = [];
  const headCount = Math.max(1, Math.round(BUDGET.head * scaleFactor));
  for (let i = 0; i < headCount; i++) points.push(sampleSphereSurface(SKELETON.headCenter, SKELETON.headRadius, Math.random(), Math.random()));
  for (const key of Object.keys(SKELETON)) {
    if (key === 'headCenter' || key === 'headRadius') continue;
    const seg = SKELETON[key];
    const count = Math.max(1, Math.round(BUDGET[key] * scaleFactor));
    for (let i = 0; i < count; i++) points.push(sampleCapsuleSurface(seg.A, seg.B, seg.rA, seg.rB, Math.random(), Math.random() * Math.PI * 2));
  }
  return points;
}

// ================= Camera choreography =================
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
const easeInOutQuad = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const orbitToCartesian = (radius, height, angle) => [radius * Math.cos(angle), height, radius * Math.sin(angle)];

const CLOSEUP_FROM = { pos: [0.5, 3.6, 2.0], look: [0, 3.4, 0] };
const CLOSEUP_TO = { pos: [1.1, 3.15, 4.6], look: [0, 3.0, 0] };
const ORBIT_RADIUS = 10.5, ORBIT_HEIGHT = 2.6, ORBIT_LOOK = [0, 0.6, 0];
const SHOTS = [
  { name: 'closeup', tStart: 0, tEnd: 1100, from: CLOSEUP_FROM, to: CLOSEUP_TO, ease: easeInOutQuad },
  { name: 'reveal', tStart: 1100, tEnd: 2500, from: CLOSEUP_TO, to: { pos: orbitToCartesian(ORBIT_RADIUS, ORBIT_HEIGHT, 0), look: ORBIT_LOOK }, ease: easeOutCubic },
  { name: 'orbit', tStart: 2500, tEnd: 4600, orbit: true, radius: ORBIT_RADIUS, height: ORBIT_HEIGHT, look: ORBIT_LOOK, fromAngle: 0, toAngle: Math.PI * 2, ease: easeInOutQuad },
];
const SEQUENCE_END = SHOTS[SHOTS.length - 1].tEnd;
const IDLE_SPIN_SPEED = 0.00009;

function getCameraState(elapsedMs, scrollProgressIn) {
  const sp = Math.min(1, Math.max(0, scrollProgressIn || 0));
  if (elapsedMs < SEQUENCE_END) {
    for (const shot of SHOTS) {
      if (elapsedMs >= shot.tStart && elapsedMs < shot.tEnd) {
        const p = shot.ease(Math.min(1, Math.max(0, (elapsedMs - shot.tStart) / (shot.tEnd - shot.tStart))));
        if (shot.orbit) return { shot: shot.name, pos: orbitToCartesian(shot.radius, shot.height, lerp(shot.fromAngle, shot.toAngle, p)), look: shot.look };
        return { shot: shot.name, pos: lerp3(shot.from.pos, shot.to.pos, p), look: lerp3(shot.from.look, shot.to.look, p) };
      }
    }
  }
  const t = Math.max(0, elapsedMs - SEQUENCE_END);
  const angle = SHOTS[SHOTS.length - 1].toAngle + t * IDLE_SPIN_SPEED;
  return { shot: 'idle', pos: orbitToCartesian(ORBIT_RADIUS - sp * 3.5, ORBIT_HEIGHT + sp * 1.5, angle), look: ORBIT_LOOK };
}

// ================= Three.js scene =================
let renderer, scene, camera, ambientField, figureParticles, clock;
let scrollProgress = 0, mouseNX = 0, mouseNY = 0, cameraStartTime = null;
let pageVisible = true;
let morphStart = null;

const VERTEX = /* glsl */`
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aFrom;      // where the point starts before assembling
  attribute float aDelay;    // 0..1 stagger for the assembly
  varying vec3 vColor;
  varying float vDepth;
  uniform float uTime;
  uniform float uAmp;
  uniform float uMorph;      // 0 = scattered, 1 = assembled
  uniform float uPixelRatio;
  void main() {
    vColor = aColor;
    float m = clamp((uMorph - aDelay * 0.6) / 0.4, 0.0, 1.0);
    m = m * m * (3.0 - 2.0 * m);
    vec3 pos = mix(aFrom, position, m);
    pos.x += sin(uTime * 0.3 + aPhase) * uAmp;
    pos.y += cos(uTime * 0.25 + aPhase * 1.3) * uAmp;
    pos.z += sin(uTime * 0.2 + aPhase * 0.7) * uAmp;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vDepth = -mvPosition.z;
    gl_PointSize = aSize * uPixelRatio * (220.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const FRAGMENT = /* glsl */`
  varying vec3 vColor;
  varying float vDepth;
  uniform float uFadeNear;
  uniform float uFadeFar;
  void main() {
    vec2 uv = gl_PointCoord.xy - 0.5;
    float d = length(uv);
    float alpha = pow(smoothstep(0.5, 0.0, d), 2.2) * 0.85;
    // Points near the lens or very far fade out so the field has depth instead of blur.
    alpha *= smoothstep(uFadeNear, uFadeNear + 2.5, vDepth) * (1.0 - smoothstep(uFadeFar - 8.0, uFadeFar, vDepth));
    gl_FragColor = vec4(vColor, alpha);
  }
`;

function buildPointsSystem(positionsArr, fromArr, ampVal, baseSize, sizeJitter, brightness) {
  const count = positionsArr.length;
  const positions = new Float32Array(count * 3), from = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count), phases = new Float32Array(count), delays = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions.set(positionsArr[i], i * 3);
    from.set(fromArr[i], i * 3);
    const c = pickColor();
    colors[i * 3] = c[0] * brightness; colors[i * 3 + 1] = c[1] * brightness; colors[i * 3 + 2] = c[2] * brightness;
    sizes[i] = baseSize + Math.random() * sizeJitter;
    phases[i] = Math.random() * Math.PI * 2;
    delays[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aFrom', new THREE.BufferAttribute(from, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('aDelay', new THREE.BufferAttribute(delays, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmp: { value: ampVal }, uMorph: { value: 0 }, uPixelRatio: { value: 1 }, uFadeNear: { value: 1.2 }, uFadeFar: { value: 46 } },
    vertexShader: VERTEX, fragmentShader: FRAGMENT,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

function randomAmbientPoint() {
  const r = 8 + Math.pow(Math.random(), 0.5) * 22;
  const theta = Math.random() * Math.PI * 2, phi = Math.acos(Math.random() * 2 - 1);
  return [r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta) * 0.6, r * Math.cos(phi)];
}

function initGrove3D(canvas) {
  if (!canvas) return false;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x050506, 1);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);
    camera.position.set(...CLOSEUP_FROM.pos);

    const small = isSmall();
    const ambientCount = small ? 900 : 2200;
    const ambientPositions = [];
    for (let i = 0; i < ambientCount; i++) ambientPositions.push(randomAmbientPoint());
    ambientField = buildPointsSystem(ambientPositions, ambientPositions, 0.4, 0.35, 0.9, 0.5);
    ambientField.material.uniforms.uMorph.value = 1;
    scene.add(ambientField);

    // Fewer, smaller, dimmer points than v1: with additive blending the figure must read as a
    // constellation of distinct lights, not a solid white mass.
    const figurePositions = generateFigurePositions(small ? 0.4 : 0.7);
    const figureFrom = figurePositions.map(randomAmbientPoint);
    figureParticles = buildPointsSystem(figurePositions, figureFrom, 0.05, 0.28, 0.4, 0.62);
    // On desktop the figure stands to the right of the copy; on phones it sits low behind it.
    figureParticles.position.set(small ? 0 : 2.4, small ? -1.6 : -0.2, 0);
    scene.add(figureParticles);
    for (const p of [ambientField, figureParticles]) p.material.uniforms.uPixelRatio.value = dpr;

    clock = new THREE.Clock();
    window.addEventListener('resize', onGroveResize);
    document.addEventListener('visibilitychange', () => { pageVisible = document.visibilityState === 'visible'; });
    return true;
  } catch (err) {
    console.error('Grove3D init failed', err);
    canvas.remove();
    return false;
  }
}

function onGroveResize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

let lastShotName = null;
function updateShotLabel(name) {
  if (name === lastShotName) return;
  lastShotName = name;
  const el = document.getElementById('shot-label');
  if (!el) return;
  const labels = { closeup: 'Shot 01 — close-up', reveal: 'Shot 02 — reveal', orbit: 'Shot 03 — orbit 360°', idle: 'Live' };
  el.textContent = labels[name] || name;
}

function animateGrove3D(now) {
  requestAnimationFrame(animateGrove3D);
  if (!renderer || !scene || !camera || !pageVisible) return;
  const nowMs = now || performance.now();
  if (cameraStartTime === null) { cameraStartTime = nowMs; morphStart = nowMs; }

  const t = clock.getElapsedTime();
  const speed = reducedMotion ? 0.15 : 1;
  ambientField.material.uniforms.uTime.value = t * speed;
  figureParticles.material.uniforms.uTime.value = t * speed;
  ambientField.rotation.y += 0.00035 * speed;

  // Assembly: the figure gathers itself out of the field over ~2.6s.
  const morph = reducedMotion ? 1 : Math.min(1, (nowMs - morphStart) / 2600);
  figureParticles.material.uniforms.uMorph.value = morph;

  const camElapsed = reducedMotion ? SEQUENCE_END + 1 : nowMs - cameraStartTime;
  const state = getCameraState(camElapsed, scrollProgress);
  camera.position.set(state.pos[0], state.pos[1], state.pos[2]);
  camera.lookAt(state.look[0] + mouseNX * 0.5, state.look[1] + mouseNY * 0.25, state.look[2]);
  updateShotLabel(state.shot);
  renderer.render(scene, camera);
}

// ================= Preloader =================
let preloaderDone = false;
function finishPreloader() {
  if (preloaderDone) return;
  preloaderDone = true;
  const el = document.getElementById('preloader');
  if (el) el.classList.add('preloader-hide');
}
function initPreloader() {
  const pct = document.getElementById('preloader-pct'), bar = document.getElementById('preloader-bar');
  const minDuration = reducedMotion ? 150 : 1000;
  const start = performance.now();
  (function tick() {
    const p = Math.min(100, Math.floor(((performance.now() - start) / minDuration) * 100));
    if (pct) pct.textContent = String(p).padStart(3, '0');
    if (bar) bar.style.width = p + '%';
    if (p < 100) requestAnimationFrame(tick); else finishPreloader();
  })();
  setTimeout(finishPreloader, 3000);
}

// ================= Cursor / magnetic / tilt =================
function initCustomCursor() {
  if (isTouchDevice || reducedMotion) return;
  const dotEl = document.getElementById('cursor-dot'), ring = document.getElementById('cursor-ring');
  if (!dotEl || !ring) return;
  document.body.classList.add('custom-cursor-active');
  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my, moved = false;
  window.addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    dotEl.style.transform = `translate(${mx}px, ${my}px)`;
    if (!moved) { moved = true; document.body.classList.add('cursor-visible'); }
    mouseNX = (e.clientX / innerWidth) * 2 - 1;
    mouseNY = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });
  (function loop() { rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16; ring.style.transform = `translate(${rx}px, ${ry}px)`; requestAnimationFrame(loop); })();
  document.querySelectorAll('[data-cursor-hover]').forEach((el) => {
    el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hovering'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hovering'));
  });
}
function initMagnetic() {
  if (isTouchDevice || reducedMotion) return;
  document.querySelectorAll('[data-magnetic]').forEach((btn) => {
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      btn.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.3}px, ${(e.clientY - r.top - r.height / 2) * 0.3}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = 'translate(0,0)'; });
  });
}
function initTilt() {
  if (isTouchDevice || reducedMotion) return;
  document.querySelectorAll('[data-tilt]').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.style.transform = `perspective(700px) rotateX(${(0.5 - py) * 12}deg) rotateY(${(px - 0.5) * 12}deg) translateZ(4px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = 'perspective(700px) rotateX(0) rotateY(0) translateZ(0)'; });
  });
}

// ================= Text + reveal + counters =================
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ01#$%&*';
function scrambleText(el, finalText, dur = 1200) {
  const start = performance.now(), len = finalText.length;
  (function frame(now) {
    const t = Math.min(1, (now - start) / dur);
    let out = '';
    for (let i = 0; i < len; i++) {
      const ch = finalText[i];
      if (ch === ' ') { out += ' '; continue; }
      const revealPoint = i / len;
      if (t > revealPoint + 0.15) out += ch;
      else if (t > revealPoint - 0.1) out += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      else out += ' ';
    }
    el.textContent = out;
    if (t < 1) requestAnimationFrame(frame); else el.textContent = finalText;
  })(performance.now());
}
function initScramble() {
  document.querySelectorAll('[data-scramble]').forEach((el, i) => {
    const finalText = el.getAttribute('data-scramble') || el.textContent;
    if (reducedMotion) { el.textContent = finalText; return; }
    setTimeout(() => scrambleText(el, finalText, 1300), 900 + i * 200);
  });
}
function initReveal() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}
function countUp(el, target, duration) {
  const start = performance.now();
  (function tick(now) {
    const p = Math.min(1, (now - start) / duration);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
    if (p < 1) requestAnimationFrame(tick); else el.textContent = target.toLocaleString();
  })(performance.now());
}
function initCountUps() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { countUp(e.target, parseFloat(e.target.dataset.count), reducedMotion ? 50 : 1400); io.unobserve(e.target); }
    });
  }, { threshold: 0.4 });
  document.querySelectorAll('[data-count]').forEach((el) => io.observe(el));
}

// ================= Spotlight heatmap (labelled example data) =================
function buildSpotlightHeatmap() {
  const el = document.getElementById('spotlight-heatmap');
  if (!el) return;
  let html = '';
  for (let w = 0; w < 22; w++) {
    html += '<div class="sp-col">';
    for (let d = 0; d < 7; d++) {
      const recency = w / 22, base = Math.random();
      let val = 0;
      if (base < 0.16 + recency * 0.22) val = 0; else if (base < 0.42) val = 1; else if (base < 0.68) val = 2; else if (base < 0.88) val = 3; else val = 4;
      html += `<div class="sp-cell l${val}"></div>`;
    }
    html += '</div>';
  }
  el.innerHTML = html;
}

// ================= Ticker: things people track (no invented streaks) =================
function buildTicker() {
  const items = ['Morning run', 'Read 20 pages', 'Cold shower', 'Meditate', 'Practice guitar', 'Drink water', 'Write journal', 'Stretch', 'Sketch', 'Sleep by 11'];
  const track = document.getElementById('ticker-track');
  if (!track) return;
  const seq = items.map((h) => `<span>${h.toUpperCase()}</span>`).join('');
  track.innerHTML = seq + seq;
}

// ================= Mobile menu =================
function initMobileMenu() {
  const burger = document.getElementById('nav-burger'), menu = document.getElementById('mobile-menu');
  if (!burger || !menu) return;
  const setOpen = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
  };
  burger.addEventListener('click', () => setOpen(menu.hidden));
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) setOpen(false); });
}

// ================= Scroll progress =================
function initScrollProgress() {
  const update = () => {
    const max = document.body.scrollHeight - innerHeight;
    scrollProgress = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

// ================= Boot =================
function boot() {
  initPreloader();
  initCustomCursor();
  initMagnetic();
  initScramble();
  initTilt();
  initReveal();
  initCountUps();
  buildTicker();
  buildSpotlightHeatmap();
  initMobileMenu();
  initScrollProgress();
  const canvas = document.getElementById('webgl-bg');
  if (initGrove3D(canvas)) requestAnimationFrame(animateGrove3D);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
