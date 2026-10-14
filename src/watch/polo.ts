import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gearGeometry } from './gear';
import type { Mats } from './materials';
import { screw } from './calibre';

// Piaget Polo Skeleton — case, dial side and strap, measured from the reference photo against the
// published 42 mm diameter (≈ 12.7 px/mm in the 2000 px photo). Millimetres, dial faces +z.
// Case is 6.5 mm thick: z runs from −3.25 (caseback) to +3.25 (crystal).

const TAU = Math.PI * 2;
const V2 = (x: number, y: number) => new THREE.Vector2(x, y);
const UI = '"Geist Variable", sans-serif';
const DISPLAY = '"Bodoni Moda Variable", serif';

// ── the "cushion in a circle" ───────────────────────────────────────
// The bezel opening is a superellipse: bulging sides, big rounded corners (~33.4 mm across in the photo).
export const CUSHION = { a: 16.7, n: 3.3 };
/** Distance from the centre to a superellipse of half-size `a` along angle `t` (0 = 3 o'clock, CCW). */
export const cushionR = (t: number, a = CUSHION.a, n = CUSHION.n) =>
  a / Math.pow(Math.pow(Math.abs(Math.cos(t)), n) + Math.pow(Math.abs(Math.sin(t)), n), 1 / n);
function cushion(a: number, seg = 256): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * TAU, r = cushionR(t, a);
    pts.push(V2(r * Math.cos(t), r * Math.sin(t)));
  }
  return pts;
}
/** A true circle as points — 256 of them, so polished round edges don't show facets. */
const ring = (r: number, seg = 256) => Array.from({ length: seg }, (_, i) => V2(r * Math.cos((i / seg) * TAU), r * Math.sin((i / seg) * TAU)));
// Scaling one superellipse (rather than offsetting it) makes every inner ring wider at the corners —
// which is exactly what the Polo's flange does.

const Z = {
  caseback: -3.25, caseMid: [-1.9, 1.35] as const, bezelTop: 2.95,
  crystal: [2.32, 3.0] as const, flangeOuter: 2.25, flangeInner: 1.7,
  indexBase: 1.72, hour: 2.02, minute: 2.14,
};
export const POLO_Z = Z;

function mesh(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], cast = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast;
  o.receiveShadow = true;
  return o;
}
const lathe = (profile: [number, number][], seg = 192) =>
  new THREE.LatheGeometry(profile.map(([r, z]) => V2(r, z)), seg).rotateX(Math.PI / 2);
function latheSegs(profile: [number, number][], seg = 192) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < profile.length - 1; i++) parts.push(lathe([profile[i], profile[i + 1]], seg));
  return mergeGeometries(parts);
}

// ── ridged parts: hands and indices are two facets meeting at a centre ridge ───────────────
/** A symmetric blade along +y. `stations` = [y, halfWidth, ridgeHeight]; base thickness `t`.
 *  Flat-shaded so each facet catches light as one plane, like a diamond-cut hand. */
function ridgedBlade(stations: [number, number, number][], t: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  for (let i = 0; i < stations.length - 1; i++) {
    const [y0, w0, h0] = stations[i], [y1, w1, h1] = stations[i + 1];
    const L0 = [-w0, y0, t], R0 = [w0, y0, t], C0 = [0, y0, t + h0];
    const L1 = [-w1, y1, t], R1 = [w1, y1, t], C1 = [0, y1, t + h1];
    const bL0 = [-w0, y0, 0], bR0 = [w0, y0, 0], bL1 = [-w1, y1, 0], bR1 = [w1, y1, 0];
    tri(L0, C0, C1); tri(L0, C1, L1);                 // left facet
    tri(C0, R0, R1); tri(C0, R1, C1);                 // right facet
    tri(bL0, L0, L1); tri(bL0, L1, bL1);              // left wall
    tri(bR0, bR1, R1); tri(bR0, R1, R0);              // right wall
    tri(bL0, bL1, bR1); tri(bL0, bR1, bR0);           // underside
  }
  const [ys, ws, hs] = stations[0];                   // closed back end
  tri([-ws, ys, 0], [ws, ys, 0], [ws, ys, t]); tri([-ws, ys, 0], [ws, ys, t], [0, ys, t + hs]); tri([-ws, ys, 0], [0, ys, t + hs], [-ws, ys, t]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Openworked alpha hand: a gold outline along `stations` ([y, halfWidth]) with a hollow between
 *  holeY[0]..holeY[1], rails `rail` wide; rounded polished edges from a 3-step bevel. */
function openHand(stations: [number, number][], holeY: [number, number], rail: number, t: number) {
  const hw = (y: number) => {
    for (let i = 0; i < stations.length - 1; i++) {
      const [y0, w0] = stations[i], [y1, w1] = stations[i + 1];
      if (y >= y0 && y <= y1) return w0 + ((w1 - w0) * (y - y0)) / (y1 - y0);
    }
    return 0;
  };
  const outline = [...stations.map(([y, w]) => V2(w, y)), ...[...stations].reverse().map(([y, w]) => V2(-w, y))];
  const shape = new THREE.Shape(outline);
  const n = 24, inner: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, y = holeY[0] + (holeY[1] - holeY[0]) * f;
    inner.push(V2(Math.max(0.01, (hw(y) - rail) * Math.pow(Math.sin(Math.PI * f), 0.35)), y));
  }
  shape.holes.push(new THREE.Path([...inner, ...[...inner].reverse().map((p) => V2(-p.x, p.y))]));
  return new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.028, bevelSegments: 3, curveSegments: 12 });
}

/** Text engraved along a ring on a canvas centred on the part (mm → px via k). Top text reads
 *  clockwise, bottom text counter-clockwise, so both stay upright — the way case engravers do it. */
function engraveAlong(g: CanvasRenderingContext2D, S: number, k: number, text: string, radius: number, centreDeg: number, size: number, stepDeg: number, font: string) {
  const bottom = Math.sin((centreDeg * Math.PI) / 180) < 0;
  // CSS font shorthand needs weight BEFORE size — "40px 500 Geist" is invalid, and canvas silently
  // falls back to 10px, which engraved every letter as a speck
  const [weight, ...family] = font.split(' ');
  g.font = `${weight} ${size * k}px ${family.join(' ')}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  [...text].forEach((ch, i) => {
    const off = (i - (text.length - 1) / 2) * stepDeg;
    const a = ((centreDeg + (bottom ? off : -off)) * Math.PI) / 180;
    g.save();
    g.translate(S / 2 + radius * k * Math.cos(a), S / 2 - radius * k * Math.sin(a));
    g.rotate(bottom ? -a + (3 * Math.PI) / 2 : -a + Math.PI / 2); // upright at 6 (a = 3π/2 → 0) and at 12 (a = π/2 → 0)
    g.fillText(ch, 0, 0);
    g.restore();
  });
}
function centredTexture(c: HTMLCanvasElement, R: number) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  t.repeat.set(1 / (2 * R), 1 / (2 * R)); t.offset.set(0.5, 0.5);
  return t;
}
/** Crown end face: satin rose gold, an engraved medallion ring and a serif P. */
function crownFaceMaterial() {
  const S = 512, R = 2.0, k = S / (2 * R), c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f1c1a4'; g.fillRect(0, 0, S, S);
  for (let r = 2; r < S * 0.72; r += 3) { g.strokeStyle = (r / 3) % 2 < 1 ? 'rgba(255,255,255,0.12)' : 'rgba(120,70,50,0.08)'; g.lineWidth = 1.4; g.beginPath(); g.arc(S / 2, S / 2, r, 0, TAU); g.stroke(); }
  g.strokeStyle = g.fillStyle = '#a0705a';
  g.lineWidth = 0.09 * k; g.beginPath(); g.arc(S / 2, S / 2, 1.3 * k, 0, TAU); g.stroke();
  g.font = `600 ${1.45 * k}px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('P', S / 2, S / 2 + 0.06 * k);
  return new THREE.MeshPhysicalMaterial({ map: centredTexture(c, R), metalness: 1, roughness: 0.22 });
}
/** Caseback ring: circular-brushed rose gold, engraved PIAGET (~11), Au750 (~9), SWISS MADE split
 *  by the 6 o'clock screw. Serial and hallmarks deliberately left off. */
function casebackMaterial() {
  const S = 2048, R = 20.2, k = S / (2 * R), c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#eebb9e'; g.fillRect(0, 0, S, S);
  for (let r = 2; r < S * 0.72; r += 2.2) { g.strokeStyle = (r / 2.2) % 2 < 1 ? 'rgba(255,255,255,0.11)' : 'rgba(120,70,50,0.07)'; g.lineWidth = 1.1; g.beginPath(); g.arc(S / 2, S / 2, r, 0, TAU); g.stroke(); }
  g.fillStyle = '#a4715a';
  const rt = 16.4;
  engraveAlong(g, S, k, 'PIAGET', rt, 120, 1.05, 4.6, `500 ${DISPLAY}`);
  engraveAlong(g, S, k, 'Au750', rt, 180, 0.85, 3.6, `500 ${UI}`);
  engraveAlong(g, S, k, 'SWISS', rt, 254, 0.8, 3.4, `500 ${UI}`);
  engraveAlong(g, S, k, 'MADE', rt, 286, 0.8, 3.4, `500 ${UI}`);
  return new THREE.MeshPhysicalMaterial({ map: centredTexture(c, R), metalness: 1, roughness: 0.34 });
}

// ── printing on the flange ──────────────────────────────────────────
function flangeTexture() {
  const S = 2048, R = 17.2, k = S / (2 * R);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number): [number, number] => [(x / (2 * R) + 0.5) * S, (0.5 - y / (2 * R)) * S];
  // lacquer: deep royal blue, a touch lighter toward the outer edge where the slope catches light
  const grd = g.createRadialGradient(S / 2, S / 2, 12 * k, S / 2, S / 2, 17 * k);
  grd.addColorStop(0, '#1b3570'); grd.addColorStop(1, '#244690');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  g.strokeStyle = g.fillStyle = '#eef0f4';
  // minute track: one tick a minute, following the cushion
  for (let i = 0; i < 60; i++) {
    const t = Math.PI / 2 - (i / 60) * TAU;
    const ro = cushionR(t, CUSHION.a - 0.35), ri = cushionR(t, CUSHION.a - (i % 5 ? 0.95 : 1.15));
    g.lineWidth = (i % 5 ? 0.075 : 0.1) * k;
    g.beginPath(); g.moveTo(...px(ro * Math.cos(t), ro * Math.sin(t))); g.lineTo(...px(ri * Math.cos(t), ri * Math.sin(t))); g.stroke();
  }
  // SWISS | MADE either side of the 6 o'clock index, bracketed
  g.font = `500 ${0.62 * k}px ${UI}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const y6 = -cushionR(-Math.PI / 2, CUSHION.a - 0.75);
  g.fillText('SWISS', ...px(-1.55, y6));
  g.fillText('MADE', ...px(1.55, y6));
  g.lineWidth = 0.06 * k;
  for (const x of [-2.8, -0.35, 0.35, 2.75]) { g.beginPath(); g.moveTo(...px(x, y6 - 0.38)); g.lineTo(...px(x, y6 + 0.38)); g.stroke(); }
  // the wordmark at ~10:30, running along the corner's tangent (fan study — set in a close serif,
  // not Piaget's logo file)
  const t10 = (3 * Math.PI) / 4 - 0.1, rl = cushionR(t10, CUSHION.a - 1.5);
  g.save();
  g.translate(...px(rl * Math.cos(t10), rl * Math.sin(t10)));
  g.rotate(-(t10 - Math.PI / 2));
  g.font = `500 ${0.95 * k}px ${DISPLAY}`;
  const word = 'PIAGET', track = 0.14 * k;
  const widths = [...word].map((ch) => g.measureText(ch).width);
  let x = -(widths.reduce((a, b) => a + b, 0) + track * (word.length - 1)) / 2;
  g.textAlign = 'left';
  [...word].forEach((ch, i) => { g.fillText(ch, x, 0); x += widths[i] + track; });
  g.restore();
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 16;
  return { tx, R };
}

/** The flange: a sloped cushion band from the bezel opening down to the movement. UVs are
 *  x/y in mm so the printed texture projects straight down onto the slope. */
function flangeGeometry(R: number) {
  const seg = 256, outer = cushion(CUSHION.a - 0.02, seg), inner = cushion(CUSHION.a - 1.95, seg);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i < seg; i++) {
    for (const [p, z] of [[outer[i], Z.flangeOuter], [inner[i], Z.flangeInner]] as const) {
      pos.push(p.x, p.y, z);
      uv.push(p.x / (2 * R) + 0.5, p.y / (2 * R) + 0.5);
    }
    const a = i * 2, b = ((i + 1) % seg) * 2;
    idx.push(a, b, a + 1, b, b + 1, a + 1); // wound so the slope faces up and inward
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ── alligator strap ─────────────────────────────────────────────────
function alligatorMaps() {
  // one tile = full strap width (u 0..1) × 28 mm of length. Big rectangular scales down the
  // centre, smaller squarish ones on the flanks, stitched edges.
  const W = 512, H = 640, mmU = 22, mmV = 28;
  const make = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')!] as const; };
  const [, h] = make(), [cc, col] = make(), [rc, rough] = make();
  h.fillStyle = '#000'; h.fillRect(0, 0, W, H);
  col.fillStyle = '#080d1c'; col.fillRect(0, 0, W, H);
  rough.fillStyle = '#d0d0d0'; rough.fillRect(0, 0, W, H);
  let seed = 9;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const scale = (x: number, y: number, w: number, hh: number) => {
    const gap = 3, r = Math.min(w, hh) * 0.22;
    const path = (ctx: CanvasRenderingContext2D) => { ctx.beginPath(); ctx.roundRect(x + gap, y + gap, w - 2 * gap, hh - 2 * gap, r); };
    const g = h.createRadialGradient(x + w / 2, y + hh / 2, 0, x + w / 2, y + hh / 2, Math.max(w, hh) * 0.62);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.75, '#eaeaea'); g.addColorStop(1, '#b8b8b8'); // flat-topped scales, not domes
    h.fillStyle = g; path(h); h.fill();
    const tone = 24 + Math.round(rand() * 10);
    col.fillStyle = `rgb(${tone - 10},${tone - 2},${tone + 22})`; path(col); col.fill();
    rough.fillStyle = '#a8a8a8'; path(rough); rough.fill();
  };
  // Hide is irregular: every row a different height, every scale a different width, big rectangles
  // down the centre shrinking to small squarish ones at the flanks (a uniform grid read as a toy).
  // Rows wrap exactly at H so the tile repeats without a seam.
  const rowsH: number[] = [];
  for (let left = H; left > 0;) { const hh = Math.min(left, H * (0.11 + rand() * 0.07)); rowsH.push(hh); left -= hh; }
  let y = 0;
  rowsH.forEach((hh, row) => {
    let x = 26;
    while (x < W - 26) {
      const centre = Math.abs(x - W / 2) < W * 0.2;
      const cw = Math.min(W - 26 - x, W * (centre ? 0.2 + rand() * 0.1 : 0.08 + rand() * 0.06));
      if (centre) scale(x, y, cw, hh);
      else { const half = hh / 2, off = (row % 2) * half * 0.4; scale(x, y + off - half, cw, half); scale(x, y + off, cw, half); scale(x, y + off + half, cw, half); }
      x += cw;
    }
    y += hh;
  });
  // stitching just inside both edges: raised thread dashes
  for (const x of [16, W - 16]) for (let y = 4; y < H; y += 18) {
    h.fillStyle = '#e0e0e0'; h.fillRect(x - 2, y, 4, 10);
    col.fillStyle = '#26345e'; col.fillRect(x - 2, y, 4, 10);
  }
  // height → normal map
  const hd = h.getImageData(0, 0, W, H).data;
  const [nc, n] = make();
  const out = n.createImageData(W, H);
  const at = (x: number, y: number) => hd[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 1.1, dy = (at(x, y + 1) - at(x, y - 1)) * 1.1;
    const len = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
    out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
    out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
    out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
    out.data[i + 3] = 255;
  }
  n.putImageData(out, 0, 0);
  const t = (c: HTMLCanvasElement, srgb = false) => {
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = THREE.ClampToEdgeWrapping; tx.wrapT = THREE.RepeatWrapping;
    tx.repeat.set(1, 1 / mmV);
    tx.anisotropy = 16;
    if (srgb) tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  };
  void mmU;
  return { map: t(cc, true), normalMap: t(nc), roughnessMap: t(rc) };
}

/** One strap: leaves the lugs flat, then curls back the way it would round a wrist.
 *  Swept rounded-rectangle section, padded crown, tapering 22 → 18 mm. */
function strapGeometry(sign: 1 | -1) {
  const y0 = 22.4 * sign, z0 = -0.55, straight = 5, R = 15, sweep = 1.95, L = straight + R * sweep;
  const steps = 120, ring = 28;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = (i / steps) * L;
    let py: number, pz: number, ny: number, nz: number;
    if (s <= straight) { py = y0 + sign * s; pz = z0; ny = 0; nz = 1; }
    else {
      const phi = (s - straight) / R;
      py = y0 + sign * (straight + R * Math.sin(phi)); pz = z0 - R + R * Math.cos(phi);
      ny = sign * Math.sin(phi); nz = Math.cos(phi);
    }
    const f = s / L, w = 21.6 - 3.6 * f, t = 2.8 - 0.6 * f, rr = 0.9;
    for (let j = 0; j < ring; j++) {
      // rounded rectangle, walked around: top (padded), right edge, bottom, left edge
      const a = (j / ring) * TAU;
      const cx = Math.cos(a), cz = Math.sin(a);
      const ex = Math.sign(cx) * Math.pow(Math.abs(cx), 0.18), ez = Math.sign(cz) * Math.pow(Math.abs(cz), 0.35);
      const x = ex * (w / 2), n = ez * (t / 2) + (cz > 0 ? 0.18 * (1 - Math.pow(Math.abs(cx), 2)) : 0);
      void rr;
      pos.push(x, py + ny * n, pz + nz * n);
      uv.push(x / w + 0.5, s);
    }
    if (i < steps) for (let j = 0; j < ring; j++) {
      const a = i * ring + j, b = i * ring + ((j + 1) % ring), c2 = a + ring, d = b + ring;
      if (sign > 0) idx.push(a, c2, b, b, c2, d); else idx.push(a, b, c2, b, d, c2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ── assembly ────────────────────────────────────────────────────────
export interface PoloParts {
  caseGroup: THREE.Group;     // case middle, bezel, lugs, crown
  straps: readonly [THREE.Mesh, THREE.Mesh]; // top, bottom — they slide off the lugs when exploded
  crystal: THREE.Group;
  back: THREE.Group;          // caseback ring + sapphire
  dialSide: THREE.Group;      // flange + indices
  hands: { group: THREE.Group; hour: THREE.Mesh; minute: THREE.Mesh };
}

export function buildPolo(mats: Mats): PoloParts {
  const caseGroup = new THREE.Group(), crystal = new THREE.Group(), back = new THREE.Group(), dialSide = new THREE.Group();

  // case middle: horizontally brushed band between polished chamfers (Piaget's alternating finish)
  caseGroup.add(mesh(latheSegs([[17.4, -1.9], [20.1, -1.9], [20.65, -1.65], [20.95, -1.05]]), mats.roseGold));
  caseGroup.add(mesh(lathe([[20.95, -1.05], [21.03, -0.55], [21.06, 0.05], [21.03, 0.65], [20.96, 1.05]], 256), mats.roseGoldBrushed));
  caseGroup.add(mesh(latheSegs([[20.96, 1.05], [20.85, 1.35], [17.4, 1.35], [17.4, -1.9]]), mats.roseGold));

  // bezel: round outside, cushion inside; brushed top, polished rounded edges
  const bezel = new THREE.Shape(ring(20.85));
  bezel.holes.push(new THREE.Path(cushion(CUSHION.a, 256)));
  const bz = new THREE.ExtrudeGeometry(bezel, { depth: 1.2, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 5, curveSegments: 64 });
  bz.translate(0, 0, Z.bezelTop - 1.2 - 0.2);
  caseGroup.add(mesh(bz, [mats.roseGoldBrushed, mats.roseGold]));

  // integrated lugs: short faceted horns, 22 mm apart
  const lugShape = (sign: 1 | -1) => {
    const p = (y: number, z: number) => V2(y * sign, z);
    const pts = [p(19.2, 1.2), p(22.4, 0.85), p(24.3, 0.2), p(24.6, -0.55), p(24.2, -1.25), p(22.0, -1.55), p(19.6, -1.85)];
    return new THREE.Shape(sign > 0 ? pts : pts.reverse());
  };
  const alongX = (x0: number) => new THREE.Matrix4().set(0, 0, 1, x0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  const lugs: THREE.BufferGeometry[] = [];
  for (const sy of [1, -1] as const) for (const x0 of [-14.1, 11.1]) {
    lugs.push(new THREE.ExtrudeGeometry(lugShape(sy), { depth: 3.0, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 6, curveSegments: 24 }).applyMatrix4(alongX(x0)));
  }
  for (const g of lugs) {
    // taper: 3.0 mm wide at the case, 2.3 mm at the tip
    const q = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < q.count; i++) {
      const xc = Math.sign(q.getX(i)) * 12.6, f = THREE.MathUtils.clamp((Math.abs(q.getY(i)) - 19.2) / 5.4, 0, 1);
      q.setX(i, xc + (q.getX(i) - xc) * (1 - 0.23 * f));
    }
    g.computeVertexNormals();
  }
  caseGroup.add(mesh(mergeGeometries(lugs), [mats.roseGold, mats.roseGoldBrushed]));

  // crown: notched rose-gold rim on a short tube; flat end face carrying a serif P in a medallion
  const crownAt = (x0: number) => new THREE.Matrix4().set(0, 0, 1, x0, 1, 0, 0, 0, 0, 1, 0, -0.25, 0, 0, 0, 1);
  const grip = gearGeometry({ teeth: 22, module: 0.17 }, 2.1).applyMatrix4(crownAt(22.55));
  const tube = new THREE.CylinderGeometry(1.0, 1.0, 1.6, 32).rotateZ(Math.PI / 2).translate(21.3, 0, -0.25).toNonIndexed();
  const face = new THREE.ExtrudeGeometry(new THREE.Shape(ring(1.86, 96)), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3 })
    .applyMatrix4(crownAt(23.6));
  caseGroup.add(mesh(grip, mats.roseGold), mesh(tube, mats.roseGold), mesh(face, [crownFaceMaterial(), mats.roseGold]));

  // quick-release strap pushers, visible under the lugs from the back
  const pushers = [-12.6, 12.6].flatMap((x) => [-1, 1].map((sy) =>
    new THREE.CylinderGeometry(0.42, 0.42, 0.3, 24).rotateX(Math.PI / 2).translate(x, sy * 23.0, -2.0).toNonIndexed()));
  caseGroup.add(mesh(mergeGeometries(pushers), mats.steelPolished));

  // strap
  const leather = new THREE.MeshPhysicalMaterial({ ...alligatorMaps(), roughness: 1, metalness: 0, specularIntensity: 0.55, clearcoat: 0.1, clearcoatRoughness: 0.45, sheen: 0.12, sheenColor: 0x22305a, normalScale: new THREE.Vector2(0.6, 0.6) });
  const straps = [mesh(strapGeometry(1), leather), mesh(strapGeometry(-1), leather)] as const;

  // crystal: flat cushion sapphire seated in the opening
  const cr = new THREE.ExtrudeGeometry(new THREE.Shape(cushion(CUSHION.a + 0.05, 256)), { depth: Z.crystal[1] - Z.crystal[0] - 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 64 });
  cr.translate(0, 0, Z.crystal[0] + 0.05);
  // faces are AR-coated; the polished edge is not, so it keeps a glint (lifted, the crystal read as a black disc)
  const edge = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0, transmission: mats.sapphire.transmission, thickness: 0.6, ior: 1.77, specularIntensity: 1, transparent: mats.sapphire.transparent, opacity: mats.sapphire.transparent ? 0.35 : 1 });
  const crm = mesh(cr, [mats.sapphire, edge], false);
  crm.renderOrder = 2;
  crystal.add(crm);

  // caseback: a wide brushed rose-gold ring, six screws at 12/2/4/6/8/10, engraved, round a sapphire.
  // Built facing +z then turned over, so its engraving reads the right way round from behind.
  const backRing = new THREE.Shape(ring(20.0));
  backRing.holes.push(new THREE.Path(ring(14.1)));
  const brg = new THREE.ExtrudeGeometry(backRing, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 4, curveSegments: 96 })
    .rotateY(Math.PI).translate(0, 0, -2.02);
  back.add(mesh(brg, [casebackMaterial(), mats.roseGold]));
  back.add(mesh(mergeGeometries([90, 30, -30, -90, -150, 150].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return screw(18.2 * Math.cos(a), 18.2 * Math.sin(a), -3.26, -1, 0.5);
  })), mats.roseGold));
  const bc = mesh(new THREE.ExtrudeGeometry(new THREE.Shape(ring(14.2)), { depth: 0.55, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }).translate(0, 0, -3.0), mats.sapphire, false);
  bc.renderOrder = 2;
  back.add(bc);

  // flange with the minute track, SWISS MADE and the wordmark
  const { tx, R } = flangeTexture();
  mats.flange.map = tx;
  mats.flange.needsUpdate = true;
  dialSide.add(mesh(flangeGeometry(R), mats.flange, false));

  // applied indices: faceted rose-gold wedges, pointed inside, fixed to the flange at the outer end
  // and cantilevered over the movement
  const indexGeo = ridgedBlade([[0, 0.02, 0.04], [0.6, 0.14, 0.09], [3.3, 0.55, 0.22]], 0.16);
  const idxGeos: THREE.BufferGeometry[] = [];
  for (let h = 0; h < 12; h++) {
    const t = Math.PI / 2 - (h / 12) * TAU;
    const rOut = cushionR(t, CUSHION.a - 1.85);
    const g = indexGeo.clone().rotateZ(-Math.PI / 2).translate(rOut - 3.3, 0, 0).rotateZ(t).translate(0, 0, Z.indexBase);
    idxGeos.push(g);
  }
  dialSide.add(mesh(mergeGeometries(idxGeos), mats.roseGoldSatin));

  // hands: openworked alpha swords — a polished gold outline, hollow down the middle. No seconds hand.
  const hourGeo = openHand([[-1.8, 0.42], [0, 0.72], [2.0, 0.95], [7.4, 0.72], [9.7, 0.26], [10.6, 0.01]], [2.4, 8.5], 0.3, 0.11);
  const minGeo = openHand([[-2.3, 0.32], [0, 0.55], [2.2, 0.66], [11.2, 0.46], [14.8, 0.16], [15.6, 0.01]], [2.7, 13.2], 0.24, 0.1);
  const hour = mesh(hourGeo, mats.roseGoldSatin); hour.position.z = Z.hour;
  const minute = mesh(minGeo, mats.roseGoldSatin); minute.position.z = Z.minute;
  const boss = new THREE.LatheGeometry([V2(1.05, 0), V2(1.02, 0.16), V2(0.62, 0.28), V2(0.001, 0.32)], 48).rotateX(Math.PI / 2).translate(0, 0, Z.minute + 0.1);
  const hands = new THREE.Group();
  hands.add(hour, minute, mesh(boss, mats.roseGoldSatin));
  return { caseGroup, straps, crystal, back, dialSide, hands: { group: hands, hour, minute } };
}
