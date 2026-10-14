import '@fontsource-variable/bodoni-moda/opsz.css';
import '@fontsource-variable/geist/index.css';
import './style.css';
import * as THREE from 'three';
import arrowDownRight from '@phosphor-icons/core/light/arrow-down-right-light.svg?raw';
import mapPin from '@phosphor-icons/core/light/map-pin-light.svg?raw';
import handGrabbing from '@phosphor-icons/core/light/hand-grabbing-light.svg?raw';
import { buildWatch, EXPLODE, EXPLODE_AXIS, type LayerName } from './watch/build';
import { makeMaterials } from './watch/materials';
import { studioScene } from './watch/studio';
import { poseAt } from './story';
import { makeSky } from './skyMesh';

import { guessPlace, skyAt, sunAltitude, MOON, INK, type Place } from './astro/sky';

const ICONS: Record<string, string> = {
  'arrow-down-right': arrowDownRight,
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

function webgl2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

if (!webgl2()) $('.nogl').hidden = false;
else start();

async function start() {
  // ── sky first, so the page never flashes the wrong colour ──────────
  let place: Place = guessPlace();
  const root = document.documentElement.style;
  const themeMeta = document.querySelector('meta[name="theme-color"]')!;

  // ── renderer ───────────────────────────────────────────────────────
  const coarse = matchMedia('(pointer: coarse)').matches;
  const high = !coarse && (navigator.hardwareConcurrency ?? 4) >= 6;
  const canvas = $<HTMLCanvasElement>('.gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // supersample: even on a 1× screen, render the watch at 2× and let the browser downsample —
  // fine teeth, screw slots and minute ticks alias badly at one sample per pixel
  renderer.setPixelRatio(high ? 2 : Math.min(Math.max(devicePixelRatio, 1.25), 1.5));
  renderer.toneMapping = THREE.NeutralToneMapping; // Khronos PBR Neutral: true product colour
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = high;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r186 removed PCFSoft; shadow.radius softens instead
  // the shadow map is redrawn every other frame (see the loop): re-rendering the watch into it was the
  // costliest thing left, and a shadow one frame old is invisible
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  // 512² reflections on the high tier: polished bevels mirror the softbox edges crisply
  scene.environment = pmrem.fromScene(studioScene(), 0.012, 0.1, 100, { size: high ? 512 : 256 }).texture;
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
  // No post-processing. Ambient occlusion (GTAO) was tried for contact shadows between bridges and
  // wheels: barely visible beside the shadow map, and 20–45 ms a frame on a Radeon 660M close-up.
  // Bloom was tried twice: it turned polished lugs into lamps.

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
  function refreshAstro() {
    live('place', place.label);
    live('place-src', place.exact ? ', from your device.' : ', estimated from your time zone.');
  }
  refreshAstro();

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
        refreshAstro();
        applySky(new Date());
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

  // ── hold 60 fps: step the resolution down until frames fit ─────────
  // A second in which over a quarter of frames ran past 60 Hz takes a quarter off the pixel ratio
  // (2 → 1); below that, shadows go. Judging the 75th percentile ignores one-off hitches (shader
  // compiles, texture uploads, GC), which would otherwise ratchet it down for good, yet still catches
  // the every-other-frame shadow redraws that miss vsync. It never steps back up: no oscillation.
  const window60: number[] = [];
  let warm = 0, frameNo = 0;
  function lowerQuality() {
    const pr = renderer.getPixelRatio();
    if (pr > 1) { renderer.setPixelRatio(Math.max(1, pr - 0.25)); resize(); return; }
    renderer.shadowMap.enabled = key.castShadow = false;
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
    renderer.shadowMap.needsUpdate = (frameNo++ & 1) === 0;
    renderer.render(scene, camera);

    if (performance.now() - lastAstro > 30_000) {
      lastAstro = performance.now();
      refreshAstro();
      applySky(now);
    }
    if ((renderer.getPixelRatio() > 1 || key.castShadow) && !document.hidden && ++warm > 90 && window60.push(dt) >= 60) {
      if (window60.sort((a, b) => a - b)[45] > 1 / 55) lowerQuality();
      window60.length = 0;
    }
  });
}
