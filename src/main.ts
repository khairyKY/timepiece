import '@fontsource-variable/bodoni-moda/opsz.css';
import '@fontsource-variable/geist/index.css';
import './style.css';
import * as THREE from 'three';
import speakerHigh from '@phosphor-icons/core/light/speaker-high-light.svg?raw';
import speakerSlash from '@phosphor-icons/core/light/speaker-slash-light.svg?raw';
import arrowDownRight from '@phosphor-icons/core/light/arrow-down-right-light.svg?raw';
import mapPin from '@phosphor-icons/core/light/map-pin-light.svg?raw';
import handGrabbing from '@phosphor-icons/core/light/hand-grabbing-light.svg?raw';
import { buildWatch, EXPLODE, EXPLODE_AXIS, type LayerName } from './watch/build';
import { makeMaterials } from './watch/materials';
import { studioScene } from './watch/studio';
import { BEATS_PER_SEC } from './watch/train';
import { poseAt } from './story';
import { makeSky } from './skyMesh';

import { guessPlace, skyAt, sunAltitude, sunTimes, MOON, INK, type Place } from './astro/sky';

const ICONS: Record<string, string> = {
  'speaker-high': speakerHigh, 'speaker-slash': speakerSlash, 'arrow-down-right': arrowDownRight,
  'map-pin': mapPin, 'hand-grabbing': handGrabbing,
};
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const live = (key: string, text: string) => document.querySelectorAll(`[data-live="${key}"]`).forEach((el) => (el.textContent = text));
const setIcon = (el: Element, name: string) => { el.innerHTML = ICONS[name] ?? ''; };
document.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => setIcon(el, el.dataset.icon!));

// ?still behaves like reduced motion (poses snap): handy for screenshots of a hidden tab
const still = new URLSearchParams(location.search).has('still');
if (still) document.documentElement.classList.add('still');
const reduced = still
  ? { matches: true }
  : matchMedia('(prefers-reduced-motion: reduce)');
const secondsSinceMidnight = (d: Date) => d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
// 24-hour times
const hhmm = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function webgl2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

if (!webgl2()) $('.nogl').hidden = false;
else start();

async function start() {
  // ── sky first, so the page never flashes the wrong colour ──────────
  let place: Place = guessPlace();
  let previewMin: number | null = null;
  const root = document.documentElement.style;
  const themeMeta = document.querySelector('meta[name="theme-color"]')!;

  // ── renderer ───────────────────────────────────────────────────────
  const coarse = matchMedia('(pointer: coarse)').matches;
  let high = !coarse && (navigator.hardwareConcurrency ?? 4) >= 6;
  const canvas = $<HTMLCanvasElement>('.gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // supersample: even on a 1× screen, render the watch at 2× and let the browser downsample —
  // fine teeth, screw slots and minute ticks alias badly at one sample per pixel
  const targetRatio = () => (high ? 2 : Math.min(Math.max(devicePixelRatio, 1.25), 1.5));
  renderer.setPixelRatio(targetRatio());
  renderer.toneMapping = THREE.NeutralToneMapping; // Khronos PBR Neutral: true product colour
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = high;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r186 removed PCFSoft; shadow.radius softens instead

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioScene(), 0.02).texture;
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(26, innerWidth / innerHeight, 1, 3000);
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.castShadow = high;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 4;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x6b6258, 0.35);
  scene.environmentIntensity = 1.15;
  const sky = makeSky();
  scene.add(key, key.target, hemi, sky.mesh);

  function applySky(at: Date, snap = false) {
    const alt = sunAltitude(at, place);
    const s = skyAt(alt);
    sky.set(s.zenith, s.horizon, s.night, snap || reduced.matches);
    root.setProperty('--zenith', s.zenith);
    root.setProperty('--horizon', s.horizon);
    root.setProperty('--text', s.text);
    root.setProperty('--scrim', s.scrim);
    root.setProperty('--on-text', s.light ? INK : MOON);
    themeMeta.setAttribute('content', s.zenith);
    // The watch stays studio-lit whatever the hour — only the backdrop follows the sky. (Tying the
    // key light to the real sun made the product go dark and muddy at night.) A faint tint remains.
    const day = THREE.MathUtils.clamp((alt + 6) / 16, 0, 1);
    hemi.color.set('#ffffff').lerp(new THREE.Color(s.zenith), 0.15);
    hemi.groundColor.set('#6b6258');
    key.color.set('#e8eeff').lerp(new THREE.Color('#fff4e6'), day);
  }
  applySky(new Date(), true);

  // ── the watch (the flange is printed in the page fonts, so wait for them) ──
  await Promise.all([
    document.fonts.load('500 64px "Bodoni Moda Variable"'),
    document.fonts.load('600 64px "Bodoni Moda Variable"'),
    document.fonts.load('500 32px "Geist Variable"'),
  ]).catch(() => undefined);
  const mats = makeMaterials(high);
  const watch = buildWatch(mats);
  scene.add(watch.root);

  // ── live readouts ──────────────────────────────────────────────────
  function refreshAstro(now: Date) {
    const t = sunTimes(now, place);
    live('sunrise', t.sunrise ? hhmm.format(t.sunrise) : t.alwaysUp ? 'Up all day' : 'None today');
    live('sunset', t.sunset ? hhmm.format(t.sunset) : t.alwaysUp ? 'Up all day' : 'None today');
    live('place', place.label);
    live('place-src', place.exact ? ', from your device.' : ', estimated from your time zone.');
  }
  refreshAstro(new Date());

  // ── scroll → chapter progress (read in the render loop, no scroll listener) ──
  const sections = [...document.querySelectorAll<HTMLElement>('.ch')];
  let centres: number[] = [];
  const measure = () => { centres = sections.map((s) => s.offsetTop + s.offsetHeight / 2); };
  function progress() {
    const y = scrollY + innerHeight / 2;
    if (y <= centres[0]) return 0;
    for (let i = 0; i < centres.length - 1; i++) if (y < centres[i + 1]) return i + (y - centres[i]) / (centres[i + 1] - centres[i]);
    return centres.length - 1;
  }

  // copy reveals as each chapter arrives
  const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('is-in')), { threshold: 0.2 });
  sections.forEach((s) => {
    [...s.querySelector('.copy')!.children].forEach((c, i) => (c as HTMLElement).style.setProperty('--i', String(i)));
    if (s !== sections[0]) io.observe(s);
  });

  // ── drag / keys to turn the watch ──────────────────────────────────
  const user = { yaw: 0, pitch: 0 };
  let dragging = false, dragged = false, lastX = 0, lastY = 0, userChapter = 0;
  const hint = $('.drag-hint');
  canvas.addEventListener('pointerdown', (e) => {
    dragging = dragged = true;
    [lastX, lastY] = [e.clientX, e.clientY];
    userChapter = Math.round(progress());
    canvas.setPointerCapture(e.pointerId);
    hint.classList.remove('is-on');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    user.yaw += (e.clientX - lastX) * 0.008;
    if (e.pointerType === 'mouse') user.pitch = THREE.MathUtils.clamp(user.pitch + (e.clientY - lastY) * 0.006, -1.1, 1.1);
    [lastX, lastY] = [e.clientX, e.clientY];
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('dblclick', () => { user.yaw = user.pitch = 0; });
  canvas.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: [-0.3, 0], ArrowRight: [0.3, 0], ArrowUp: [0, -0.2], ArrowDown: [0, 0.2] }[e.key];
    if (!step) return;
    e.preventDefault();
    dragged = true;
    userChapter = Math.round(progress());
    user.yaw += step[0];
    user.pitch = THREE.MathUtils.clamp(user.pitch + step[1], -1.1, 1.1);
  });
  setTimeout(() => { if (!dragged && progress() < 0.5) hint.classList.add('is-on'); }, 2800);

  // ── tick sound: synthesised, off until asked for ───────────────────
  let audio: AudioContext | null = null, noise: AudioBuffer | null = null, soundOn = false, lastBeat = -1;
  const soundBtn = $<HTMLButtonElement>('#sound');
  soundBtn.addEventListener('click', async () => {
    soundOn = !soundOn;
    if (soundOn && !audio) {
      audio = new AudioContext();
      noise = audio.createBuffer(1, audio.sampleRate * 0.05, audio.sampleRate);
      const ch = noise.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audio.sampleRate * 0.004));
    }
    if (soundOn) await audio!.resume();
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.setAttribute('aria-label', soundOn ? 'Turn tick sound off' : 'Turn tick sound on');
    setIcon(soundBtn.querySelector('[data-icon]')!, soundOn ? 'speaker-high' : 'speaker-slash');
  });
  function tick(tock: boolean) {
    if (!audio || !noise) return;
    const t = audio.currentTime;
    const src = audio.createBufferSource();
    src.buffer = noise;
    const band = audio.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = tock ? 2600 : 3300; // tick and tock differ slightly, like a real lever escapement
    band.Q.value = 7;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    src.connect(band).connect(gain).connect(audio.destination);
    src.start(t);
  }

  // ── location ───────────────────────────────────────────────────────
  const locateBtn = $<HTMLButtonElement>('#locate');
  const locateLabel = locateBtn.querySelector('span:last-child')!;
  locateBtn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) { live('place-src', ', estimated from your time zone. This browser cannot share a location.'); return; }
    locateBtn.disabled = true;
    locateLabel.textContent = 'Finding you';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        place = { lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'Your exact location', exact: true };
        const now = new Date();
        refreshAstro(now);
        applySky(previewDate() ?? now);
        locateLabel.textContent = 'Location set';
      },
      (err) => {
        locateBtn.disabled = false;
        locateLabel.textContent = 'Use my location';
        live('place-src', err.code === err.PERMISSION_DENIED
          ? ', estimated from your time zone. Location access was declined.'
          : ', estimated from your time zone. Your location could not be read. Try again.');
      },
      { timeout: 10_000, maximumAge: 600_000 },
    );
  });

  // ── preview the sky at another hour (never changes the watch's time) ──
  const hour = $<HTMLInputElement>('#hour'), hourOut = $<HTMLOutputElement>('#hour-out'), nowBtn = $<HTMLButtonElement>('#now');
  const syncSlider = () => { const d = new Date(); hour.value = String(Math.round((d.getHours() * 60 + d.getMinutes()) / 5) * 5); };
  const previewDate = () => {
    if (previewMin === null) return null;
    const d = new Date();
    d.setHours(Math.floor(previewMin / 60), previewMin % 60, 0, 0);
    return d;
  };
  syncSlider();
  hour.addEventListener('input', () => {
    previewMin = Number(hour.value);
    const d = previewDate()!;
    hourOut.textContent = hhmm.format(d);
    nowBtn.hidden = false;
    applySky(d);
  });
  nowBtn.addEventListener('click', () => {
    previewMin = null;
    hourOut.textContent = 'Now';
    nowBtn.hidden = true;
    syncSlider();
    applySky(new Date());
  });

  // ── layout ─────────────────────────────────────────────────────────
  // size from the canvas itself: innerWidth includes the scrollbar, and a buffer 2% wider than its
  // box gets resampled — a soft blur over everything
  let viewW = 1, viewH = 1;
  function resize() {
    viewW = canvas.clientWidth || innerWidth;
    viewH = canvas.clientHeight || innerHeight;
    renderer.setSize(viewW, viewH, false);
    camera.aspect = viewW / viewH;
    camera.updateProjectionMatrix();
    measure();
  }
  resize();
  addEventListener('resize', resize);

  // ── motion state: damped toward the scroll pose ────────────────────
  const first = poseAt(0);
  const cur = {
    rotX: first.rotX, rotY: first.rotY - (reduced.matches ? 0 : 0.9), dist: first.dist * (reduced.matches ? 1 : 1.7),
    tx: 0, ty: 0, tz: 0, sx: first.shift[0], sy: first.shift[1],
    explode: Object.fromEntries(Object.keys(EXPLODE).map((k) => [k, 0])) as Record<LayerName, number>,
  };
  const damp = (a: number, b: number, dt: number, l = 4) => (reduced.matches ? b : THREE.MathUtils.damp(a, b, l, dt));
  const target = new THREE.Vector3();
  const lightDir = new THREE.Vector3(-0.42, 0.62, 0.66).normalize();
  let shadowSpan = 0;

  // ── quality: drop to the lower tier if frames run long ─────────────
  // steps down in order of what costs most and shows least: resolution → shadows + glass
  let frames = 0, slow = 0, tier = high ? 3 : 1;
  function lowerQuality() {
    if (tier === 3) { renderer.setPixelRatio(1.5); resize(); tier = 2; return; }
    if (tier !== 2) return;
    tier = 1; high = false;
    renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio, 1), 1.25));
    renderer.shadowMap.enabled = key.castShadow = false;
    for (const mt of [mats.sapphire, mats.ruby]) { mt.transmission = 0; mt.needsUpdate = true; }
    Object.assign(mats.sapphire, { transparent: true, opacity: 0.12 });
    resize();
  }

  const gLocal = new THREE.Vector3(), qInv = new THREE.Quaternion();
  const timer = new THREE.Timer();
  timer.connect(document);
  let lastAstro = performance.now();
  sections[0].classList.add('is-in');

  renderer.setAnimationLoop((ts) => {
    timer.update(ts);
    const dt = Math.min(timer.getDelta(), 0.1);
    const now = new Date();
    const s = secondsSinceMidnight(now);
    // gravity in the watch's own frame drives the micro-rotor (last frame's orientation is close enough)
    gLocal.set(0, -1, 0).applyQuaternion(qInv.copy(watch.root.quaternion).invert());
    watch.update(s, dt, gLocal);

    const beat = Math.floor(s * BEATS_PER_SEC);
    if (soundOn && beat !== lastBeat) tick(beat % 2 === 1);
    lastBeat = beat;

    const p = progress();
    const pose = poseAt(p);
    const mobile = innerWidth < 768;
    cur.rotX = damp(cur.rotX, pose.rotX, dt);
    cur.rotY = damp(cur.rotY, pose.rotY, dt, 3);
    cur.dist = damp(cur.dist, pose.dist, dt, 3);
    cur.tx = damp(cur.tx, pose.target[0], dt);
    cur.ty = damp(cur.ty, pose.target[1], dt);
    cur.tz = damp(cur.tz, pose.target[2], dt);
    cur.sx = damp(cur.sx, mobile ? 0 : pose.shift[0], dt);
    cur.sy = damp(cur.sy, mobile ? 0.2 : pose.shift[1], dt);
    for (const k of Object.keys(EXPLODE) as LayerName[]) {
      cur.explode[k] = damp(cur.explode[k], pose.explode[k] ?? 0, dt, 5);
      watch.layers[k].position[EXPLODE_AXIS[k] ?? 'z'] = EXPLODE[k] * cur.explode[k];
    }
    // a new chapter hands the pose back to the story
    if (!dragging && Math.round(p) !== userChapter) {
      user.yaw = damp(user.yaw, 0, dt, 2.5);
      user.pitch = damp(user.pitch, 0, dt, 2.5);
    }
    if (p >= 0.5) hint.classList.remove('is-on');

    const idle = reduced.matches ? 0 : 0.035 * Math.sin(ts / 4000);
    watch.root.rotation.set(cur.rotX + user.pitch, cur.rotY + user.yaw + idle, 0, 'YXZ');
    watch.root.updateMatrixWorld();

    // camera sits in front of the framed point; portrait screens back off to keep the watch whole
    target.set(cur.tx, cur.ty, cur.tz).applyMatrix4(watch.root.matrixWorld);
    // copy sits beside the watch on desktop, below it on phones: back off until both fit
    const fit = Math.max(1, (mobile ? 0.8 : 1.5) / camera.aspect);
    camera.position.set(target.x, target.y, target.z + cur.dist * fit);
    camera.lookAt(target);
    camera.setViewOffset(viewW, viewH, -cur.sx * viewW, cur.sy * viewH, viewW, viewH);

    // key light follows the camera, upper left, and its shadow box follows the subject
    key.position.copy(lightDir).applyQuaternion(camera.quaternion).multiplyScalar(300).add(target);
    key.target.position.copy(target);
    const span = Math.max(26, cur.dist * fit * 0.3);
    if (Math.abs(span - shadowSpan) > 2) {
      shadowSpan = span;
      Object.assign(key.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 150, far: 450 });
      key.shadow.camera.updateProjectionMatrix();
    }

    sky.step(1 - Math.exp(-dt * 2.2), renderer.getPixelRatio());
    renderer.render(scene, camera);

    if (performance.now() - lastAstro > 30_000) {
      lastAstro = performance.now();
      refreshAstro(now);
      if (previewMin === null) { applySky(now); syncSlider(); }
    }
    // rolling 4-second windows (after a warm-up for shader compiles): mostly-slow → step down one tier
    if (tier > 1 && !document.hidden && ++frames > 90) {
      if (dt > 1 / 30) slow++;
      if (frames >= 330) { if (slow > 150) lowerQuality(); frames = 90; slow = 0; }
    }
  });
}
