import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gearGeometry, type GearSpec } from './gear';
import type { Mats } from './materials';
import { TRAIN, MOTION, RPS, trainTime, balanceDeg, forkDeg, wheelAngle } from './train';

// Calibre 1200S1, laid out from Piaget's published description + the reference photo
// (docs/research-polo.md): openworked barrel at 12–1 under a three-armed bridge, keyless works at 3,
// hour and minute wheels at the centre, escapement at ~5, balance at 6, micro-rotor at 8–10 set
// flush into the plate. 31.9 mm across, 2.4 mm thick, 3 Hz.
// Tooth counts are unpublished: every wheel below is MODELLED on the standard 3 Hz train (train.ts),
// placed by true meshing distance so gears that touch really mesh. Movement front faces +z.

const TAU = Math.PI * 2;
const V2 = (x: number, y: number) => new THREE.Vector2(x, y);
const polar = (r: number, deg: number) => V2(r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180));
const MOV_R = 15.95;

export const CZ = {
  backBridges: [-1.18, -0.86] as const, backWheels: -0.74, plate: [-0.62, -0.12] as const,
  bridges: [0.55, 0.95] as const, minuteDrive: 1.06, works: 1.26, hourBridge: [1.42, 1.58] as const,
};

// ── helpers ─────────────────────────────────────────────────────────
function mesh(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], cast = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast; o.receiveShadow = true;
  return o;
}
const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)));
function circle(cx: number, cy: number, r: number) { const s = new THREE.Shape(); s.absarc(cx, cy, r, 0, TAU, false); return s; }
function hole(cx: number, cy: number, r: number) { const p = new THREE.Path(); p.absarc(cx, cy, r, 0, TAU, true); return p; }
/** Convex hull of circles: bosses round pivots and screws, straight tapered flanks between. */
function hull(circles: [number, number, number][], seg = 64): THREE.Shape {
  const pts: [number, number][] = [];
  for (const [x, y, r] of circles) for (let i = 0; i < seg; i++) { const a = (i / seg) * TAU; pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]); }
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (list: [number, number][]) => {
    const out: [number, number][] = [];
    for (const p of list) { while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop(); out.push(p); }
    return out.slice(0, -1);
  };
  return new THREE.Shape([...chain(pts), ...chain([...pts].reverse())].map(([x, y]) => V2(x, y)));
}
const arm = (a: THREE.Vector2, ra: number, b: THREE.Vector2, rb: number) => hull([[a.x, a.y, ra], [b.x, b.y, rb]]);
/** A sweeping arm: two hulls through a bowed midpoint, so bridges curve instead of running straight. */
function sweep(a: THREE.Vector2, ra: number, b: THREE.Vector2, rb: number, bow: number): THREE.Shape[] {
  const m = a.clone().lerp(b, 0.5), d = b.clone().sub(a).normalize();
  m.add(V2(-d.y * bow, d.x * bow));
  const rm = (ra + rb) / 2 * 0.92;
  return [arm(a, ra, m, rm), arm(m, rm, b, rb)];
}
/** Plate part: faces slot 0 (sunburst satin PVD), sides + 45° bevel slot 1 (polished lighter blue). */
const plate = (shape: THREE.Shape | THREE.Shape[], z0: number, z1: number, bevel = 0.11) =>
  new THREE.ExtrudeGeometry(shape, { depth: z1 - z0 - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 48 })
    .translate(0, 0, z0 + bevel);
/** Polished blind screw, domed, with a bevelled slot; faces ±z. */
export function screw(x: number, y: number, z: number, dir: 1 | -1, r = 0.4) {
  const h = r * 0.5, slot = r * 0.2;
  const prof: [number, number][] = [[r, 0], [r * 0.98, h * 0.35], [r * 0.84, h * 0.72], [r * 0.52, h * 0.95], [0.001, h]];
  const half = (phi0: number, dx: number) => new THREE.LatheGeometry(prof.map(([pr, py]) => V2(pr, py)), 16, phi0, Math.PI).translate(dx, 0, 0);
  const face = new THREE.Shape([...prof.map(([pr, py]) => V2(pr, py)), ...[...prof].reverse().map(([pr, py]) => V2(-pr, py))]);
  const cut = (rot: number, dx: number) => new THREE.ShapeGeometry(face, 6).rotateY(rot).translate(dx, 0, 0);
  return merge([half(0, slot / 2), half(Math.PI, -slot / 2), cut(-Math.PI / 2, slot / 2), cut(Math.PI / 2, -slot / 2),
    new THREE.BoxGeometry(slot * 1.02, h * 0.3, 2 * r * 0.94).translate(0, h * 0.15, 0)]).rotateX(dir * Math.PI / 2).translate(x, y, z);
}
const jewel = (x: number, y: number, z: number, dir: 1 | -1, r = 0.34) =>
  new THREE.SphereGeometry(r, 28, 10, 0, TAU, 0, Math.PI / 2).scale(1, 0.4, 1).rotateX(dir * Math.PI / 2).translate(x, y, z);
/** Polished countersink round a jewel, cut into the PVD bridge (so it shows lighter blue). */
function sink(x: number, y: number, z: number, dir: 1 | -1, r = 0.34) {
  const s = circle(0, 0, r + 0.26); s.holes.push(hole(0, 0, r));
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.05, bevelSegments: 2, curveSegments: 32 });
  return (dir > 0 ? g : g.rotateX(Math.PI)).translate(x, y, z);
}
/** Point at distance da from a and db from b (the side picked by `side`) — for placing a meshing wheel. */
function between(a: THREE.Vector2, da: number, b: THREE.Vector2, db: number, side: 1 | -1) {
  const d = a.distanceTo(b), x = (da * da - db * db + d * d) / (2 * d), h = Math.sqrt(Math.max(0, da * da - x * x));
  const u = b.clone().sub(a).divideScalar(d);
  return a.clone().addScaledVector(u, x).add(V2(-u.y * h * side, u.x * h * side));
}
/** A flat spiral ribbon (the mainspring seen through the openworked barrel). */
function spiralRibbon(r0: number, r1: number, turns: number, width: number, z: number) {
  const n = Math.round(turns * 160), pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n, a = s * turns * TAU, r = r0 + (r1 - r0) * s;
    pos.push(Math.cos(a) * (r - width / 2), Math.sin(a) * (r - width / 2), z, Math.cos(a) * (r + width / 2), Math.sin(a) * (r + width / 2), z);
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ── wheel specs (modelled) ─────────────────────────────────────────
const G = {
  barrel: { teeth: 77, module: 0.12 },
  secondPinion: { teeth: 12, module: 0.12 },
  second: { teeth: TRAIN.centre, module: 0.09, crossings: 5 },   // turns once an hour
  thirdPinion: { teeth: TRAIN.thirdPinion, module: 0.09 },
  third: { teeth: TRAIN.third, module: 0.09, crossings: 5 },
  fourthPinion: { teeth: TRAIN.fourthPinion, module: 0.09 },
  fourth: { teeth: TRAIN.fourth, module: 0.045, crossings: 5 },
  escapePinion: { teeth: TRAIN.escapePinion, module: 0.045 },
  escape: { teeth: TRAIN.escape, module: 0.19, crossings: 5, club: true },
  minuteDrive: { teeth: 30, module: 0.1, crossings: 4 },          // second wheel → idler → centre, all 30T
  cannon: { teeth: MOTION.cannon, module: 0.1 },
  minuteWheel: { teeth: MOTION.minuteWheel, module: 0.1, crossings: 6 },
  minutePinion: { teeth: MOTION.minutePinion, module: 0.1 * (48 / 50) },
  hourWheel: { teeth: MOTION.hourWheel, module: 0.1 * (48 / 50), crossings: 6 },
  rotorPinion: { teeth: 12, module: 0.1 },
  auto1: { teeth: 64, module: 0.1, crossings: 5 },
  autoPinion: { teeth: 10, module: 0.1 },
  auto2: { teeth: 75, module: 0.1, crossings: 5 },
  ratchet: { teeth: 70, module: 0.1, club: true },
  transmission: { teeth: 30, module: 0.1, crossings: 4 },
  keyless: { teeth: 36, module: 0.1, crossings: 4 },
} satisfies Record<string, GearSpec>;
const pr = (g: GearSpec) => (g.module * g.teeth) / 2;
const d = (a: GearSpec, b: GearSpec) => pr(a) + pr(b);

// ── layout (front view, mm) ─────────────────────────────────────────
const C = V2(0, 0);
const W2 = V2(4.15, 4.25);                                               // second wheel, 1 rev/h
const IDL = between(C, d(G.minuteDrive, G.minuteDrive), W2, d(G.minuteDrive, G.minuteDrive), 1);
const R = W2.clone().add(V2(-2.65, 4.65).normalize().multiplyScalar(d(G.barrel, G.secondPinion))); // barrel, ~12–1
const T = W2.clone().add(polar(d(G.second, G.thirdPinion), -70));
const F = T.clone().add(polar(d(G.third, G.fourthPinion), -100));
const E = F.clone().add(polar(d(G.fourth, G.escapePinion), -95));    // escape, ~5
const B = V2(1.2, -9.9);                                                 // balance, 6
const PL = E.clone().add(B.clone().sub(E).normalize().multiplyScalar(2.3)); // pallet arbor
const MW = polar(d(G.cannon, G.minuteWheel), 205);
const ROT = V2(-7.6, 1.0);                                               // micro-rotor, 8–10
const toBarrel = R.clone().sub(ROT).normalize();
const A2 = R.clone().addScaledVector(toBarrel, -d(G.ratchet, G.autoPinion));
const A1 = ROT.clone().addScaledVector(toBarrel, d(G.rotorPinion, G.auto1));
const TW = V2(9.9, 1.3);                                                 // transmission wheel by the crown
const K1 = TW.clone().add(polar(d(G.transmission, G.keyless), 118));
const K2 = between(K1, d(G.keyless, G.keyless), R, pr(G.keyless) + pr(G.ratchet), 1);

export const CALIBRE_ANCHORS = {
  balance: new THREE.Vector3(B.x, B.y, 0.6),
  rotor: new THREE.Vector3(ROT.x, ROT.y, -0.8),
  barrel: new THREE.Vector3(R.x, R.y, 0.6),
};

export interface Calibre {
  front: THREE.Group; balance: THREE.Group; train: THREE.Group; plate: THREE.Group; back: THREE.Group; works: THREE.Group;
  update(s: number, gravityLocal: THREE.Vector3, dt: number): void;
}

// rotor faces: engraved text, painted onto a canvas in rotor-local mm
function rotorTexture(front: boolean) {
  const S = 1024, Rr = 7, k = S / (2 * Rr);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#a4a9b0'; g.fillRect(0, 0, S, S);
  // circular satin graining
  for (let r = 4; r < S * 0.72; r += 2.4) { g.strokeStyle = (r / 2.4) % 2 < 1 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'; g.lineWidth = 1.2; g.beginPath(); g.arc(S / 2, S / 2, r, 0, TAU); g.stroke(); }
  g.fillStyle = '#5c6068';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const along = (text: string, radius: number, centreDeg: number, size: number, spread: number) => {
    g.font = `500 ${size * k}px "Bodoni Moda Variable", serif`;
    [...text].forEach((ch, i) => {
      const a = ((centreDeg + (i - (text.length - 1) / 2) * spread) * Math.PI) / 180;
      g.save(); g.translate(S / 2 + radius * k * Math.cos(a), S / 2 - radius * k * Math.sin(a)); g.rotate(-a - Math.PI / 2); g.fillText(ch, 0, 0); g.restore();
    });
  };
  if (front) along('PIAGET', 5.5, -90, 0.95, 9);
  else {
    along('MANUFACTURE', 5.6, -90, 0.62, 5.2);
    along('PIAGET', 3.4, -90, 0.8, 9);
    // a plain heraldic shield where the coat of arms sits (a stand-in, not Piaget's crest)
    g.strokeStyle = '#4c5057'; g.lineWidth = 0.08 * k;
    const [cx, cy] = [S / 2, S / 2 + 4.6 * k];
    g.beginPath(); g.moveTo(cx - 0.55 * k, cy - 0.6 * k); g.lineTo(cx + 0.55 * k, cy - 0.6 * k); g.lineTo(cx + 0.55 * k, cy);
    g.quadraticCurveTo(cx + 0.5 * k, cy + 0.55 * k, cx, cy + 0.75 * k); g.quadraticCurveTo(cx - 0.5 * k, cy + 0.55 * k, cx - 0.55 * k, cy); g.closePath(); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  t.repeat.set(1 / (2 * Rr), 1 / (2 * Rr)); t.offset.set(0.5, 0.5);
  return t;
}

export function buildCalibre(mats: Mats): Calibre {
  const front = new THREE.Group(), balanceG = new THREE.Group(), train = new THREE.Group(),
    plateG = new THREE.Group(), back = new THREE.Group(), works = new THREE.Group();
  const blue = [mats.pvdBlue, mats.pvdBlueBevel];
  const silver = [mats.silverWheel, mats.steelPolished];
  const ringAt = (deg: number) => polar(14.6, deg);

  // ── mainplate: outer ring, a cradle round the rotor, sweeping arms to every pivot ──
  // wide outer ring + generous lobes: the wheels run over blue, and the openings read as sculpted
  // windows rather than the whole surface (the first pass was thin bars over empty sky)
  const outer = circle(0, 0, MOV_R); outer.holes.push(hole(0, 0, 12.7));
  const cradle = circle(ROT.x, ROT.y, 7.55); cradle.holes.push(hole(ROT.x, ROT.y, 6.75));
  const lobes = [circle(C.x, C.y, 2.7), circle(W2.x, W2.y, 2.0), circle(T.x, T.y, 1.7), circle(F.x, F.y, 1.6), circle(E.x, E.y, 1.5), circle(B.x, B.y, 2.1), circle(PL.x, PL.y, 1.1), circle(R.x, R.y, 2.0)];
  const plateShapes: THREE.Shape[] = [
    outer, cradle, ...lobes,
    // (the second arm is aimed at 7 o'clock and bowed away so it clears the rotor's swing)
    ...sweep(C, 2.1, ringAt(-35), 1.7, 1.4), ...sweep(C, 1.9, ringAt(-125), 1.5, 1.1),
    ...sweep(W2, 1.7, ringAt(40), 1.7, -1.1), arm(W2, 1.6, T, 1.4), arm(T, 1.4, F, 1.35), arm(F, 1.35, E, 1.25),
    ...sweep(E, 1.3, ringAt(-48), 1.6, 1.0), arm(PL, 1.0, B, 1.6), ...sweep(B, 1.7, ringAt(-120), 1.5, -1.1), ...sweep(B, 1.6, ringAt(-68), 1.4, 0.8),
    ...sweep(R, 1.8, ringAt(110), 1.7, 1.1), arm(R, 1.7, W2, 1.5), arm(C, 1.9, W2, 1.5), ...sweep(C, 1.8, ringAt(12), 1.5, -0.9),
    hull([[10.2, 1.6, 2.1], [13.6, 4.8, 1.6], [13.4, -3.8, 1.6]]),      // keyless platform
    // nothing crosses the cradle: the rotor sweeps this whole band. Its bearing hangs from a back bridge.
  ];
  plateG.add(mesh(plate(plateShapes, CZ.plate[0], CZ.plate[1]), blue));

  // ── front bridges: sculpted, curved, the blue parts in the photo ──
  const barrelFeet = [205, 330, 85].map((deg) => R.clone().add(polar(6.3, deg)));
  const frontShapes: THREE.Shape[] = [
    circle(R.x, R.y, 1.75), ...barrelFeet.flatMap((f, i) => sweep(R, 1.35, f, 1.45, i === 1 ? -1.2 : 1.2)),  // three-armed barrel bridge
    circle(B.x, B.y, 1.5), ...sweep(B, 1.2, B.clone().add(polar(5.6, 195)), 1.4, -0.9), ...sweep(B, 1.2, B.clone().add(polar(5.6, -15)), 1.4, 0.9), // balance bridge
    arm(W2, 1.35, T, 1.25), arm(T, 1.25, F, 1.2), ...sweep(F, 1.2, ringAt(-12), 1.45, 0.8), ...sweep(W2, 1.35, ringAt(58), 1.45, -0.8), // train bridge
    arm(E, 1.1, PL, 1.0), ...sweep(PL, 1.0, ringAt(-62), 1.3, 0.7),                                          // escapement bridge
    hull([[9.2, 3.6, 1.5], [13.5, 5.4, 1.3], [13.2, -4.4, 1.3], [9.4, -2.8, 1.4]]),                          // keyless bridge
  ];
  // the rotor cover: blue plate over the micro-rotor with an ARCHED window, as on the real 1200S1 — the
  // grey rotor and its engraving show through only where the window is, not as one big grey slab
  const rotorCover = circle(ROT.x, ROT.y, 7.15);
  const arch = new THREE.Path();
  const a0 = (208 * Math.PI) / 180, a1 = (332 * Math.PI) / 180;
  arch.absarc(ROT.x, ROT.y, 6.35, a0, a1, false);
  arch.absarc(ROT.x, ROT.y, 3.3, a1, a0, true);
  arch.closePath();
  rotorCover.holes.push(arch, hole(ROT.x + 2.6, ROT.y + 2.9, 1.2), hole(ROT.x - 2.9, ROT.y + 2.7, 1.1), hole(ROT.x, ROT.y + 4.6, 0.9));
  frontShapes.push(rotorCover);
  const keylessBridge = frontShapes[frontShapes.length - 2]; // keyless hull sits just before the cover
  keylessBridge.holes.push(hole(11.1, 1.9, 0.7), hole(11.6, -1.6, 0.85));
  frontShapes.forEach((s) => front.add(mesh(plate(s, CZ.bridges[0], CZ.bridges[1]), blue)));

  // hour-wheel bridge: famously slender (0.11 mm at its narrowest on the real one), arching over the centre
  const hb = [...sweep(polar(4.2, 150), 0.22, polar(4.2, 30), 0.22, 2.4), circle(0, 0, 0.75)];
  works.add(mesh(plate(hb, CZ.hourBridge[0], CZ.hourBridge[1], 0.03), blue));

  // ── wheels ──
  const wheel = (at: THREE.Vector2, parts: [GearSpec, number, number][], parent = train, arbor: [number, number] = [-0.7, 1.1]) => {
    const g = new THREE.Group();
    g.position.set(at.x, at.y, 0);
    for (const [spec, z, t] of parts) { const w = mesh(gearGeometry(spec, t), spec.teeth > 20 ? silver : mats.steelPolished); w.position.z = z; g.add(w); }
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, arbor[1] - arbor[0], 12).rotateX(Math.PI / 2).translate(0, 0, (arbor[0] + arbor[1]) / 2), mats.steelPolished));
    parent.add(g);
    return g;
  };
  // openworked barrel: toothed drum, a cover with four big windows, the mainspring coiled inside
  const barrel = new THREE.Group();
  barrel.position.set(R.x, R.y, 0);
  barrel.add(mesh(gearGeometry(G.barrel, 0.2).translate(0, 0, 0.02), silver));
  const wall = circle(0, 0, 4.35); wall.holes.push(hole(0, 0, 4.05));
  const cover = circle(0, 0, 4.35);
  for (let i = 0; i < 4; i++) {
    const a0 = (i / 4) * TAU + 0.2, a1 = a0 + TAU / 4 - 0.42, win = new THREE.Path();
    win.absarc(0, 0, 3.75, a0, a1, false); win.absarc(0, 0, 1.55, a1, a0, true); win.closePath();
    cover.holes.push(win);
  }
  barrel.add(mesh(merge([plate(wall, 0.12, 0.44, 0.02), plate(cover, 0.44, 0.52, 0.02)]), silver));
  barrel.add(mesh(spiralRibbon(1.25, 3.95, 17, 0.07, 0.3), mats.steelPolished));
  barrel.add(mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.4, 32).rotateX(Math.PI / 2).translate(0, 0, 0.3), mats.steelPolished));
  train.add(barrel);

  const secondW = wheel(W2, [[G.secondPinion, 0.02, 0.2], [G.second, 0.28, 0.12], [G.minuteDrive, CZ.minuteDrive, 0.1]], train, [-0.7, 1.2]);
  const thirdW = wheel(T, [[G.thirdPinion, 0.28, 0.2], [G.third, 0.05, 0.12]]);
  const fourthW = wheel(F, [[G.fourthPinion, 0.05, 0.2], [G.fourth, 0.3, 0.1]]);
  const escapeW = wheel(E, [[G.escapePinion, 0.3, 0.18], [G.escape, 0.1, 0.12]]);
  const idler = wheel(IDL, [[G.minuteDrive, CZ.minuteDrive, 0.1]], works, [0.9, 1.25]);

  // pallet lever with its two ruby stones
  const fork = new THREE.Group();
  const toB = Math.atan2(B.y - PL.y, B.x - PL.x);
  fork.position.set(PL.x, PL.y, 0.12);
  const lever = B.distanceTo(PL) - 0.5;
  const bar = (x0: number, y0: number, x1: number, y1: number, w: number) => arm(V2(x0, y0), w / 2, V2(x1, y1), w / 2);
  fork.add(mesh(plate([bar(-0.2, 0, lever, 0, 0.24), bar(lever - 0.1, 0, lever + 0.28, 0.28, 0.12), bar(lever - 0.1, 0, lever + 0.28, -0.28, 0.12),
    bar(0, 0, -0.15, 1.0, 0.26), bar(0, 0, -0.15, -1.0, 0.26), circle(0, 0, 0.33)], -0.06, 0.06, 0.015), mats.steelPolished));
  for (const sgn of [1, -1]) { const st = mesh(new THREE.BoxGeometry(0.2, 0.36, 0.14), mats.ruby); st.position.set(-0.26, sgn * 1.18, 0); st.rotation.z = sgn * 0.35; fork.add(st); }
  train.add(fork);

  // balance at 6: rim, three arms, roller with its ruby impulse pin, silver hairspring
  const balance = new THREE.Group();
  balance.position.set(B.x, B.y, 0);
  const rim = circle(0, 0, 3.7); rim.holes.push(hole(0, 0, 3.35));
  const bArms = [90, 210, 330].map((deg) => arm(V2(0, 0), 0.2, polar(3.5, deg), 0.18));
  balance.add(mesh(plate([rim, ...bArms, circle(0, 0, 0.45)], 0.1, 0.36, 0.025), silver));
  const toFork = Math.atan2(PL.y - B.y, PL.x - B.x);
  balance.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 32).rotateX(Math.PI / 2).translate(0, 0, 0.06), mats.steelPolished));
  balance.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 10).rotateX(Math.PI / 2).translate(0.5 * Math.cos(toFork), 0.5 * Math.sin(toFork), 0.1), mats.ruby));
  balance.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 10).rotateX(Math.PI / 2).translate(0, 0, 0.35), mats.steelPolished));
  balanceG.add(balance);
  const springPts = 420, TURNS = 8, sR0 = 0.45, sR1 = 2.3;
  const springGeo = new THREE.BufferGeometry();
  springGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(springPts * 3), 3));
  const spring = new THREE.Line(springGeo, new THREE.LineBasicMaterial({ color: 0xc9ced6 }));
  spring.position.set(B.x, B.y, 0.44);
  spring.frustumCulled = false;
  balanceG.add(spring);
  const setSpring = (theta: number) => {
    const a = springGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < springPts; i++) {
      const s = i / (springPts - 1), r = sR0 + (sR1 - sR0) * s, ang = s * TURNS * TAU + theta * (1 - s);
      a.setXYZ(i, r * Math.cos(ang), r * Math.sin(ang), 0);
    }
    a.needsUpdate = true;
  };

  // keyless works at 3: stem, sliding pinion, setting lever, yoke (the silver levers in the photo)
  const stem = new THREE.CylinderGeometry(0.4, 0.4, 6.6, 20).rotateZ(Math.PI / 2).translate(12.7, 0.0, 0.2);
  const pinion = gearGeometry({ teeth: 12, module: 0.12 }, 0.7).rotateY(Math.PI / 2).translate(10.9, 0.0, 0.2);
  const settingLever = plate(hull([[9.6, -1.8, 0.5], [12.2, -3.4, 0.38], [12.0, -0.5, 0.42]]), 0.14, 0.3, 0.02);
  const yoke = plate(hull([[10.4, -0.7, 0.32], [13.1, 2.8, 0.32], [10.9, 2.3, 0.28]]), 0.32, 0.46, 0.02);
  train.add(mesh(merge([stem, pinion, settingLever, yoke]), mats.steelPolished));
  // fine wire springs: yoke spring and setting-lever jumper — thin polished curves, the dense small
  // detail the reference shows round the keyless works
  const wire = (pts: [number, number][], z: number, r = 0.075) =>
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, z))), 48, r, 8, false);
  train.add(mesh(merge([
    wire([[13.2, -2.6], [12.6, -3.5], [11.6, -3.8], [10.7, -3.3], [10.3, -2.4]], 0.42),
    wire([[9.7, 2.9], [10.5, 3.6], [11.6, 3.5], [12.3, 4.1], [12.9, 4.9]], 0.36),
    wire([[12.4, 1.4], [12.9, 2.1], [12.7, 2.8]], 0.5, 0.06),
  ]), mats.steelPolished));

  // motion works on the dial side
  const centreGear = mesh(gearGeometry(G.minuteDrive, 0.1), silver); centreGear.position.z = CZ.minuteDrive;
  const cannon = mesh(gearGeometry(G.cannon, 0.26), mats.steelPolished); cannon.position.z = CZ.works;
  const minuteWheel = new THREE.Group();
  minuteWheel.add(mesh(gearGeometry(G.minuteWheel, 0.1), silver));
  const mp = mesh(gearGeometry(G.minutePinion, 0.2), mats.steelPolished); mp.position.z = 0.16; minuteWheel.add(mp);
  minuteWheel.position.set(MW.x, MW.y, CZ.works);
  const hourWheel = mesh(gearGeometry(G.hourWheel, 0.09), silver); hourWheel.position.z = CZ.works + 0.17;
  works.add(centreGear, cannon, minuteWheel, hourWheel);

  // ── micro-rotor: slate-grey weight set flush into the plate, engraved both faces ──
  const rotor = new THREE.Group();
  rotor.position.set(ROT.x, ROT.y, 0);
  const seg = new THREE.Shape();
  seg.absarc(0, 0, 6.55, Math.PI * 1.02, Math.PI * 1.98, false);
  seg.absarc(0, 0, 1.2, Math.PI * 1.98, Math.PI * 1.02, true);
  const hubRing = circle(0, 0, 1.2); hubRing.holes.push(hole(0, 0, 0.5));
  const rotorFrontMat = new THREE.MeshPhysicalMaterial({ map: rotorTexture(true), metalness: 1, roughness: 0.32 });
  const rotorBackMat = new THREE.MeshPhysicalMaterial({ map: rotorTexture(false), metalness: 1, roughness: 0.32 });
  const rotorGeo = plate([seg, hubRing], CZ.plate[0] + 0.02, CZ.plate[1] - 0.02, 0.05);
  rotor.add(mesh(rotorGeo, [rotorFrontMat, mats.steelPolished]));
  // the back face carries its own engraving: a thin skin just behind the back lid, facing −z
  // (rotateY(π): the axis that mirrors for a viewer behind the watch — rotateX left it reading backwards)
  rotor.add(new THREE.Mesh(new THREE.ShapeGeometry(seg, 48).rotateY(Math.PI).translate(0, 0, CZ.plate[0] - 0.035), rotorBackMat));
  rotor.add(mesh(gearGeometry(G.rotorPinion, 0.15), mats.steelPolished).translateZ(CZ.backWheels));
  back.add(rotor);

  // automatic train (back): rotor pinion → two reduction wheels → ratchet over the barrel
  const auto1 = wheel(A1, [[G.auto1, CZ.backWheels, 0.1], [G.autoPinion, CZ.backWheels - 0.14, 0.14]], back, [-1.15, -0.62]);
  const auto2 = wheel(A2, [[G.auto2, CZ.backWheels - 0.14, 0.1], [G.autoPinion, CZ.backWheels - 0.28, 0.14]], back, [-1.15, -0.62]);
  const ratchet = mesh(gearGeometry(G.ratchet, 0.16), [mats.steelSunray, mats.steelPolished]);
  ratchet.position.set(R.x, R.y, CZ.backWheels - 0.28);
  back.add(ratchet);
  // the click and its spring: stops the ratchet running backwards
  const clickAt = R.clone().add(polar(pr(G.ratchet) + 0.5, -35));
  back.add(mesh(merge([
    plate(hull([[clickAt.x, clickAt.y, 0.28], [clickAt.x + 1.3, clickAt.y - 0.9, 0.36]]), CZ.backWheels - 0.36, CZ.backWheels - 0.2, 0.02),
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[1.3, -0.9], [2.4, -0.6], [2.9, 0.4], [2.5, 1.4]].map(([x, y]) => new THREE.Vector3(clickAt.x + x, clickAt.y + y, CZ.backWheels - 0.3))), 40, 0.07, 8, false),
  ]), mats.steelPolished));
  // keyless transmission (back): the crown's transmission wheel and two intermediates to the ratchet
  wheel(TW, [[G.transmission, CZ.backWheels - 0.28, 0.1]], back, [-1.15, -0.62]);
  wheel(K1, [[G.keyless, CZ.backWheels - 0.28, 0.1]], back, [-1.15, -0.62]);
  wheel(K2, [[G.keyless, CZ.backWheels - 0.28, 0.1]], back, [-1.15, -0.62]);
  // back bridges: over the automatic train and the going train, leaving the rotor and barrel open
  const backShapes: THREE.Shape[] = [
    ...sweep(A1, 0.9, A2, 0.9, 0.8), ...sweep(A2, 0.9, polar(14.2, 128), 1.1, -0.8), ...sweep(A1, 0.9, polar(14.2, 175), 1.1, 0.8),
    ...sweep(K1, 0.85, K2, 0.85, -0.6), ...sweep(K1, 0.85, polar(14.2, 20), 1.1, 0.6), arm(TW, 0.8, K1, 0.8),
    ...sweep(T, 0.8, F, 0.8, 0.4), ...sweep(F, 0.8, polar(14.2, -30), 1.0, -0.5), arm(W2, 0.85, T, 0.8),
    ...sweep(E, 0.75, B, 1.1, -0.7), ...sweep(B, 1.1, polar(14.2, -80), 1.0, 0.7),
    ...sweep(ROT, 1.0, polar(14.2, 150), 1.1, 0.7),                    // the rotor's bearing bridge
  ];
  backShapes.forEach((s) => back.add(mesh(plate(s, CZ.backBridges[0], CZ.backBridges[1]), blue)));

  // ── jewels (25 in all on the real calibre) and polished screws ──
  const jz = CZ.bridges[1];
  const frontJ = [R, W2, T, F, E, PL, B, V2(11.1, 1.9)];
  front.add(mesh(merge(frontJ.map((p) => sink(p.x, p.y, jz, 1))), mats.pvdBlueBevel, false));
  front.add(mesh(merge(frontJ.map((p) => jewel(p.x, p.y, jz + 0.02, 1))), mats.ruby, false));
  works.add(mesh(jewel(0, 0, CZ.hourBridge[1] + 0.01, 1, 0.26), mats.ruby, false));
  const bz = CZ.backBridges[0];
  const backJ = [A1, A2, K1, K2, T, F, E, B, W2];
  back.add(mesh(merge(backJ.map((p) => sink(p.x, p.y, bz, -1))), mats.pvdBlueBevel, false));
  back.add(mesh(merge(backJ.map((p) => jewel(p.x, p.y, bz - 0.02, -1, 0.3))), mats.ruby, false));
  back.add(mesh(merge([jewel(ROT.x, ROT.y, CZ.backWheels - 0.2, -1, 0.34)]), mats.ruby, false));
  const frontScrews = [...barrelFeet, ringAt(-12), ringAt(58), ringAt(-62), B.clone().add(polar(5.6, 195)), B.clone().add(polar(5.6, -15)), V2(13.2, 4.4), V2(12.9, -3.6)];
  front.add(mesh(merge(frontScrews.map((p) => screw(p.x, p.y, jz, 1))), mats.steelPolished));
  const backScrews = [polar(14.2, 128), polar(14.2, 175), polar(14.2, 20), polar(14.2, -30), polar(14.2, -80)];
  back.add(mesh(merge(backScrews.map((p) => screw(p.x, p.y, bz, -1))), mats.steelPolished));

  // ── motion ──
  let rotorPhi = NaN, rotorVel = 0;
  const barrelRPS = RPS.centre * (G.secondPinion.teeth / G.barrel.teeth) * -1;
  return {
    front, balance: balanceG, train, plate: plateG, back, works,
    update(s, gravityLocal, dt) {
      const t = trainTime(s);
      const minute = -wheelAngle(RPS.centre, t);
      // second wheel turns once an hour; its minute gear drives the centre through the idler
      secondW.rotation.z = minute;
      idler.rotation.z = -minute;
      centreGear.rotation.z = cannon.rotation.z = minute;
      hourWheel.rotation.z = -wheelAngle(RPS.hour, t);
      minuteWheel.rotation.z = -wheelAngle(RPS.minuteWheel, t);
      barrel.rotation.z = -wheelAngle(barrelRPS, t);
      thirdW.rotation.z = -wheelAngle(RPS.third, t);
      fourthW.rotation.z = -wheelAngle(RPS.fourth, t);
      escapeW.rotation.z = -wheelAngle(RPS.escape, t);
      const theta = balanceDeg(s);
      balance.rotation.z = (theta * Math.PI) / 180;
      fork.rotation.z = toB + (forkDeg(theta) * Math.PI) / 180;
      setSpring((theta * Math.PI) / 180);
      // micro-rotor: a damped pendulum. Gravity, projected into the movement's plane, pulls the heavy
      // segment (at 1.5π in rotor space) downhill — turn the watch and it swings, then settles.
      const gxy = Math.hypot(gravityLocal.x, gravityLocal.y);
      const down = Math.atan2(gravityLocal.y, gravityLocal.x);
      if (Number.isNaN(rotorPhi)) rotorPhi = down - 1.5 * Math.PI;
      for (let left = Math.min(dt, 0.1); left > 0; left -= 1 / 240) {
        const h = Math.min(left, 1 / 240);
        rotorVel += (38 * gxy * Math.sin(down - rotorPhi - 1.5 * Math.PI) - 1.6 * rotorVel) * h;
        rotorPhi += rotorVel * h;
      }
      rotor.rotation.z = rotorPhi;
      // …and the automatic train follows the rotor through its reductions
      auto1.rotation.z = -rotorPhi * (G.rotorPinion.teeth / G.auto1.teeth);
      auto2.rotation.z = -auto1.rotation.z * (G.autoPinion.teeth / G.auto2.teeth);
      ratchet.rotation.z = -auto2.rotation.z * (G.autoPinion.teeth / G.ratchet.teeth);
    },
  };
}
