import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Mats } from './materials';
import { screw } from './calibre';

// Piaget Polo Skeleton — case, dial side and strap, measured from press photographs against the
// published 42 mm diameter. Millimetres, dial faces +z; z runs from −3.25 (caseback) to +3.1 (bezel).
// Every visible surface is a swept profile with smooth normals: the case is one continuous section
// revolved round the axis, the lugs are lofted out of the flank, the bezel runs round on the outside
// and cushion-shaped on the inside. Each finish (polished / brushed) is its own mesh, so the line
// between two finishes stays as crisp as it is on the real case.

const TAU = Math.PI * 2;
const V2 = (x: number, y: number) => new THREE.Vector2(x, y);
const UI = '"Geist Variable", sans-serif';
const DISPLAY = '"Bodoni Moda Variable", serif';
const smooth = (e0: number, e1: number, x: number) => { const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const lcg = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ── the "cushion in a circle" ───────────────────────────────────────
// The bezel opening is a superellipse: bulging sides, big rounded corners (~33.4 mm across the flats).
export const CUSHION = { a: 16.7, n: 3.3 };
/** Distance from the centre to a superellipse of half-size `a` along angle `t` (0 = 3 o'clock, CCW). */
export const cushionR = (t: number, a = CUSHION.a, n = CUSHION.n) =>
  a / Math.pow(Math.pow(Math.abs(Math.cos(t)), n) + Math.pow(Math.abs(Math.sin(t)), n), 1 / n);
function cushion(a: number, seg = 256): THREE.Vector2[] {
  return Array.from({ length: seg }, (_, i) => { const t = (i / seg) * TAU, r = cushionR(t, a); return V2(r * Math.cos(t), r * Math.sin(t)); });
}
// Scaling one superellipse (rather than offsetting it) makes every inner ring wider at the corners —
// which is exactly what the Polo's flange does.

const R_CASE = 21.0;
const Z = {
  caseback: -3.25, caseMid: [-1.9, 1.36] as const, bezelTop: 3.1,
  crystal: [2.45, 2.88] as const, flangeOuter: 2.3, flangeInner: 1.7,
  indexBase: 1.72, hour: 2.02, minute: 2.14,
};

function mesh(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], cast = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast;
  o.receiveShadow = true;
  return o;
}

// ── surfaces ────────────────────────────────────────────────────────
type P3 = [number, number, number];
/** Indexed grid: rows i, columns j; `at` gives the point and its uv. Smooth normals throughout. */
function surface(ni: number, nj: number, at: (i: number, j: number) => [P3, number, number]) {
  const pos = new Float32Array(ni * nj * 3), uv = new Float32Array(ni * nj * 2), idx: number[] = [];
  for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
    const [p, u, v] = at(i, j), k = i * nj + j;
    pos.set(p, k * 3); uv[k * 2] = u; uv[k * 2 + 1] = v;
  }
  for (let i = 0; i < ni - 1; i++) for (let j = 0; j < nj - 1; j++) {
    const a = i * nj + j, b = a + 1, c = a + nj, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** Turn a surface right side out: the point furthest along `axis` must face along it. Mirrored and
 *  swept parts are built once and checked here, rather than reasoned about mirror by mirror. */
function outward(g: THREE.BufferGeometry, axis: 0 | 1 | 2 = 2) {
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute;
  let top = 0;
  for (let i = 1; i < p.count; i++) if (p.getComponent(i, axis) > p.getComponent(top, axis)) top = i;
  if (n.getComponent(top, axis) < 0) {
    const idx = g.index!.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.index!.needsUpdate = true;
    g.computeVertexNormals();
  }
  return g;
}

/** A section point: 'c' = on a circle of radius `size`, 'q' = on the cushion of half-size `size`. */
type Pt = ['c' | 'q', number, number];
const arc = (kind: 'c' | 'q', cr: number, cz: number, rad: number, a0: number, a1: number, n = 10): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; return [kind, cr + rad * Math.cos(a), cz + rad * Math.sin(a)]; });
const circlePts = (r: number, seg = 256) => Array.from({ length: seg }, (_, i) => V2(r * Math.cos((i / seg) * TAU), r * Math.sin((i / seg) * TAU)));
/** A polyline section, each segment swept separately and merged: flat facets meeting at crisp edges. */
const facets = (prof: Pt[], uv: 'planar' | 'back' | 'wrap', seg = 256) =>
  mergeGeometries(prof.slice(1).map((p, i) => revolve([prof[i], p], uv, seg)));
/** Sweep a section round the axis. Walk the section counter-clockwise in (r, z) and it faces out.
 *  uv: 'planar' = x/y in mm (straight brushing, prints) · 'back' = mirrored, read from behind ·
 *  'wrap' = mm round the circumference × mm along the section (brushing that follows the case). */
function revolve(prof: Pt[], uv: 'planar' | 'back' | 'wrap', seg = 512) {
  const len = [0];
  for (let i = 1; i < prof.length; i++) len.push(len[i - 1] + Math.hypot(prof[i][1] - prof[i - 1][1], prof[i][2] - prof[i - 1][2]));
  return surface(prof.length, seg + 1, (i, j) => {
    const t = (j / seg) * TAU, [kind, s, z] = prof[i];
    const r = kind === 'c' ? s : cushionR(t, s), x = r * Math.cos(t), y = r * Math.sin(t);
    return uv === 'wrap' ? [[x, y, z], t * R_CASE, len[i]] : [[x, y, z], uv === 'back' ? -x : x, y];
  });
}

// ── the case ────────────────────────────────────────────────────────
/** One lug, lofted along y out of the case flank: a rounded section between the strap side (x = 11.1)
 *  and an outer face that flares into the case, drooping toward the wrist, with a squircle tip. */
function lugGeometry(sx: 1 | -1, sy: 1 | -1) {
  // the root (y0) sits wholly inside the case band — outside the bore, under the flank — so the
  // flare that blends the lug into the case has no open end anywhere it can be seen
  const y0 = 12.2, yT = 22.6, tip = 1.2, NI = 70;
  const xi = (y: number) => Math.max(11.1, Math.sqrt(Math.max(0, 16.65 ** 2 - y * y)));
  const xo = (y: number) => 15.45 - 0.3 * smooth(16, yT, y) + 1.0 * (1 - smooth(13.5, 16.8, y));
  const droop = (y: number) => (y <= 16.4 ? 0 : ((y - 16.4) / (yT - 16.4)) ** 2);
  const section = (x0: number, x1: number, z0: number, z1: number) => {
    const pts: [number, number][] = [];
    const corner = (cx: number, cz: number, r: number, a0: number, n = 8) => {
      for (let k = 0; k <= n; k++) { const a = ((a0 + (90 * k) / n) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); }
    };
    const rb = 0.3, rto = Math.min(1.0, (x1 - x0) * 0.28), rti = 0.4;
    corner(x0 + rb, z0 + rb, rb, 180);     // bottom, strap side
    corner(x1 - rb, z0 + rb, rb, 270);     // bottom, outside
    corner(x1 - rto, z1 - rto, rto, 0);    // top, outside: the wide polished bevel that catches the light
    corner(x0 + rti, z1 - rti, rti, 90);   // top, strap side
    pts.push(pts[0]);
    return pts;
  };
  const NJ = section(0, 1, 0, 1).length;
  const g = surface(NI, NJ, (i, j) => {
    const v = i / (NI - 1), y = y0 + (yT - y0) * (1 - (1 - v) ** 2); // stations crowd toward the tip
    const d = droop(y), x0 = xi(y), x1 = xo(y), z1 = Z.caseMid[1] - 1.0 * d;
    const z0 = -1.9 - 0.45 * d + 0.35 * (1 - smooth(12.2, 14.2, y)); // root tucked above the band's rounded lower edge
    const [px, pz] = section(x0, x1, z0, z1)[j];
    // tip: the section closes over the last 1.2 mm along a squircle — a flat end, a rounded rim
    const u = THREE.MathUtils.clamp((y - (yT - tip)) / tip, 0, 1), s = Math.pow(1 - u ** 3.5, 1 / 3.5);
    const xc = (x0 + x1) / 2, zc = (z0 + z1) / 2;
    const x = xc + (px - xc) * s, z = zc + (pz - zc) * s;
    return [[sx * x, sy * y, z], sx * x, sy * y];
  });
  return outward(g, 2);
}

/** Crown at 3: tube, rounded collar, 24 flutes round the grip, a rounded shoulder into the end face. */
function crownGeometry(zc: number) {
  const prof: [number, number][] = [[20.6, 0.95], [21.5, 0.95], [21.5, 1.85]];
  const push = (cx: number, cr: number, rad: number, a0: number, a1: number, n = 10) => {
    for (let k = 1; k <= n; k++) { const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180; prof.push([cx + rad * Math.cos(a), cr + rad * Math.sin(a)]); }
  };
  push(21.95, 1.85, 0.45, 180, 90);                           // back edge
  for (let k = 1; k <= 24; k++) prof.push([21.95 + (1.45 * k) / 24, 2.3]); // grip
  push(23.4, 1.75, 0.55, 90, 0, 12);                         // front shoulder
  prof.push([23.97, 1.62]);
  const N = 24, seg = N * 8;
  const g = surface(prof.length, seg + 1, (i, j) => {
    const [x, r0] = prof[i], phi = (j / seg) * TAU;
    // flutes: narrow rounded grooves between broad lands, fading out over the collar and shoulder
    const w = smooth(21.75, 22.1, x) * (1 - smooth(23.25, 23.7, x));
    const r = r0 - 0.14 * w * Math.pow(0.5 + 0.5 * Math.cos(N * phi), 5);
    return [[x, r * Math.cos(phi), zc + r * Math.sin(phi)], x, phi];
  });
  return outward(g, 1);
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
/** Concentric satin lines, uneven like a real lathe tool's (an even pitch moirés into rings). */
function circularSatin(g: CanvasRenderingContext2D, S: number, step: number, seed: number) {
  const rand = lcg(seed);
  for (let r = 2; r < S * 0.72; r += step * (0.5 + rand())) {
    g.strokeStyle = rand() > 0.5 ? `rgba(255,255,255,${0.05 + rand() * 0.1})` : `rgba(110,60,40,${0.04 + rand() * 0.06})`;
    g.lineWidth = 0.7 + rand();
    g.beginPath(); g.arc(S / 2, S / 2, r, 0, TAU); g.stroke();
  }
}
/** Crown end face: satin rose gold, an engraved medallion ring and a serif P. Maps onto a disc of radius R. */
function crownFaceMaterial(R: number) {
  const S = 512, k = S / (2 * R), c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#efbfa3'; g.fillRect(0, 0, S, S);
  circularSatin(g, S, 2.5, 21);
  g.strokeStyle = g.fillStyle = '#9c6a55';
  g.lineWidth = 0.08 * k; g.beginPath(); g.arc(S / 2, S / 2, 1.25 * k, 0, TAU); g.stroke();
  g.font = `600 ${1.4 * k}px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('P', S / 2, S / 2 + 0.06 * k);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  return new THREE.MeshPhysicalMaterial({ map: t, metalness: 1, roughness: 0.24 });
}
/** Caseback ring: circular-brushed rose gold, engraved PIAGET (~11), Au750 (~1), SWISS MADE split
 *  by the 6 o'clock screw. Serial and hallmarks deliberately left off. */
function casebackMaterial(hq: boolean) {
  const S = hq ? 2048 : 1024, R = 20.2, k = S / (2 * R), c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#eebc9f'; g.fillRect(0, 0, S, S);
  circularSatin(g, S, hq ? 2.2 : 1.6, 8);
  g.fillStyle = '#9f6c57';
  const rt = 16.4;
  engraveAlong(g, S, k, 'PIAGET', rt, 120, 1.05, 4.6, `500 ${DISPLAY}`);
  engraveAlong(g, S, k, 'Au750', rt, 60, 0.85, 3.6, `500 ${UI}`);
  engraveAlong(g, S, k, 'SWISS', rt, 254, 0.8, 3.4, `500 ${UI}`);
  engraveAlong(g, S, k, 'MADE', rt, 286, 0.8, 3.4, `500 ${UI}`);
  return new THREE.MeshPhysicalMaterial({ map: centredTexture(c, R), metalness: 1, roughness: 0.3 });
}

// ── printing on the flange ──────────────────────────────────────────
function flangeTexture(hq: boolean) {
  const S = hq ? 4096 : 2048, R = 17.2, k = S / (2 * R);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number): [number, number] => [(x / (2 * R) + 0.5) * S, (0.5 - y / (2 * R)) * S];
  // lacquer: deep royal blue, a touch lighter toward the outer edge where the slope catches light
  const grd = g.createRadialGradient(S / 2, S / 2, 12 * k, S / 2, S / 2, 17 * k);
  grd.addColorStop(0, '#1a3472'); grd.addColorStop(1, '#244793');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  g.strokeStyle = g.fillStyle = '#eef0f4';
  // minute track: one tick a minute, following the cushion
  for (let i = 0; i < 60; i++) {
    const t = Math.PI / 2 - (i / 60) * TAU;
    const ro = cushionR(t, CUSHION.a - 0.35), ri = cushionR(t, CUSHION.a - (i % 5 ? 0.95 : 1.15));
    g.lineWidth = (i % 5 ? 0.07 : 0.095) * k;
    g.beginPath(); g.moveTo(...px(ro * Math.cos(t), ro * Math.sin(t))); g.lineTo(...px(ri * Math.cos(t), ri * Math.sin(t))); g.stroke();
  }
  // | SWISS | | MADE | either side of the 6 o'clock index, as printed on the real flange
  g.font = `500 ${0.6 * k}px ${UI}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const y6 = -cushionR(-Math.PI / 2, CUSHION.a - 0.75);
  g.fillText('SWISS', ...px(-1.55, y6));
  g.fillText('MADE', ...px(1.55, y6));
  g.lineWidth = 0.055 * k;
  for (const x of [-2.8, -0.35, 0.35, 2.75]) { g.beginPath(); g.moveTo(...px(x, y6 - 0.36)); g.lineTo(...px(x, y6 + 0.36)); g.stroke(); }
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
  const g = revolve([['q', CUSHION.a - 1.95, Z.flangeInner], ['q', CUSHION.a - 0.02, Z.flangeOuter]], 'planar', 512);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / (2 * R) + 0.5, uv.getY(i) / (2 * R) + 0.5);
  return outward(g, 2);
}

// ── alligator strap ─────────────────────────────────────────────────
/** Colour, normal, roughness and occlusion for one tile: the full strap width (u 0..1) × 30 mm of length.
 *  Laid out as on a hide: big domed rectangles down the centre, rows of every height, edges that lean;
 *  smaller ones either side; small round scales toward the stitching — with fine wrinkling over all. */
function alligatorMaps(hq: boolean) {
  const W = hq ? 1024 : 512, mmW = 22, mmV = 30, H = Math.round((W * mmV) / mmW), k = W / mmW;
  const mk = (h = H) => { const c = document.createElement('canvas'); c.width = W; c.height = h; return [c, c.getContext('2d')!] as const; };
  const rand = lcg(9);
  // the mask is drawn three tiles tall, so the blur wraps cleanly across the tile's top and bottom
  const [mc, m] = mk(H * 3), [cc, col] = mk();
  m.fillStyle = '#000'; m.fillRect(0, 0, W, H * 3);
  col.fillStyle = '#070e22'; col.fillRect(0, 0, W, H);
  const edge = 0.95 * k, stitch = 1.45 * k, x0 = 2.0 * k, x1 = W - 2.0 * k;
  // each scale is filled in nested insets, brighter toward the middle: a dome with a flat crown
  const dome = (path: (ctx: CanvasRenderingContext2D, inset: number, oy: number) => void, size: number) => {
    const tone = rand();
    for (const dy of [-H, 0, H]) {
      [[0, 175], [0.07, 205], [0.15, 226], [0.26, 242], [0.42, 252]].forEach(([inset, v]) => {
        if (inset * k > size * 0.45) return;
        m.fillStyle = `rgb(${v},${v},${v})`; m.beginPath(); path(m, inset * k, H + dy); m.fill();
      });
      col.fillStyle = `hsl(${221 + tone * 5}, ${60 + tone * 10}%, ${9 + tone * 2.5}%)`;
      col.beginPath(); path(col, 0, dy); col.fill();
    }
  };
  /** A rectangular scale whose side edges lean and whose corners wander: ruled rectangles read as brickwork. */
  const quad = (x: number, y: number, w: number, h: number, lean: number[]) => {
    const gap = (0.06 + rand() * 0.05) * k, j = () => (rand() - 0.5) * 0.12 * k;
    const q = [[x + gap + lean[0] + j(), y + gap + j()], [x + w - gap + lean[1] + j(), y + gap + j()],
      [x + w - gap + lean[3] + j(), y + h - gap + j()], [x + gap + lean[2] + j(), y + h - gap + j()]];
    const cx = q.reduce((a, p) => a + p[0], 0) / 4, cy = q.reduce((a, p) => a + p[1], 0) / 4;
    dome((ctx, inset, oy) => q.forEach(([px, py], i) => {
      const f = 1 - inset / (0.5 * Math.min(w, h)), X = cx + (px - cx) * f, Y = cy + (py - cy) * f + oy;
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    }), Math.min(w, h));
  };
  // rows wrap exactly at H so the tile repeats without a seam
  const rows: number[] = [];
  for (let left = H; left > 0;) { const h = Math.min(left, k * (3.0 + rand() * 2.0)); rows.push(left - h < k * 2 ? left : h); left -= rows[rows.length - 1]; }
  const cL = W / 2 - 0.17 * W, cR = W / 2 + 0.17 * W, mL = W / 2 - 0.3 * W, mR = W / 2 + 0.3 * W;
  let y = 0;
  rows.forEach((rh) => {
    // centre: two or three big rectangles across, sharing leaning edges
    const cuts = [cL];
    while (cuts[cuts.length - 1] < cR - 2 * k) cuts.push(Math.min(cR, cuts[cuts.length - 1] + k * (3.2 + rand() * 2.2)));
    cuts[cuts.length - 1] = cR;
    const leans = cuts.map((_, i) => (i === 0 || i === cuts.length - 1 ? [0, 0] : [(rand() - 0.5) * 0.7 * k, (rand() - 0.5) * 0.7 * k]));
    for (let i = 0; i < cuts.length - 1; i++) quad(cuts[i], y, cuts[i + 1] - cuts[i], rh, [leans[i][0], leans[i + 1][0], leans[i][1], leans[i + 1][1]]);
    // either side: one column of half-height scales
    for (const [a, b] of [[mL, cL], [cR, mR]]) for (let s = 0; s < 2; s++) quad(a, y + (s * rh) / 2, b - a, rh / 2, [0, 0, 0, 0]);
    y += rh;
  });
  // toward the stitching: small round scales on a jittered grid
  for (const [a, b] of [[x0, mL], [mR, x1]]) {
    const n = Math.max(1, Math.round((b - a) / (1.5 * k))), cw = (b - a) / n, rowsN = Math.round(H / (1.5 * k)), ch = H / rowsN;
    for (let r = 0; r < rowsN; r++) for (let c = 0; c < n; c++) {
      // jittered and uneven, or two tidy columns of ovals read as a bead chain
      const cx = a + (c + 0.5) * cw + (rand() - 0.5) * 0.4 * cw, cy = (r + 0.5 + (c % 2) * 0.5) * ch + (rand() - 0.5) * 0.45 * ch;
      const rx = cw * (0.34 + rand() * 0.16), ry = ch * (0.36 + rand() * 0.2), rot = (rand() - 0.5) * 0.9;
      dome((ctx, inset, oy) => ctx.ellipse(cx, cy + oy, Math.max(0.5, rx - inset), Math.max(0.5, ry - inset), rot, 0, TAU), 2 * Math.min(rx, ry));
    }
  }
  // fine wrinkles over every scale: short soft strokes, mostly across the strap
  for (let i = 0; i < (hq ? 9000 : 3000); i++) {
    const wx = rand() * W, wy = rand() * H * 3, len = k * (0.25 + rand() * 0.6), a = (rand() - 0.5) * 0.9;
    m.strokeStyle = `rgba(0,0,0,${0.06 + rand() * 0.08})`; m.lineWidth = 0.05 * k;
    m.beginPath(); m.moveTo(wx, wy); m.lineTo(wx + Math.cos(a) * len, wy + Math.sin(a) * len); m.stroke();
  }
  // height: the softened mask (middle tile), with raised stitches and a flat painted edge
  const [, h] = mk(H * 3);
  h.filter = `blur(${0.06 * k}px)`; h.drawImage(mc, 0, 0); h.filter = 'none';
  const hd = h.getImageData(0, H, W, H).data;
  const height = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) height[i] = hd[i * 4] / 255;
  const stitchHalf = 0.13 * k;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const d = Math.min(px, W - 1 - px);
    if (d < edge) height[py * W + px] = 0.55;                                   // painted edge: smooth
    else if (Math.abs(d - stitch) < stitchHalf) {                               // stitches, slanted dashes
      const phase = (((py + (px < W / 2 ? 1 : -1) * (d - stitch) * 1.2) / (1.25 * k)) % 1 + 1) % 1;
      height[py * W + px] = phase < 0.72 ? 0.35 + 0.5 * Math.sin((Math.PI * phase) / 0.72) : 0.25;
    } else if (d < x0) height[py * W + px] = 0.3;                               // the groove the stitch sits in
  }
  // colour, roughness and occlusion follow the height: creases dark and shaded (a rougher crease alone
  // caught the overhead softbox and read lighter than the scales), crowns a deeper blue and glossier
  const [rc, rough] = mk(), [nc, nrm] = mk(), [oc, occ] = mk();
  const ci = col.getImageData(0, 0, W, H), ri = rough.createImageData(W, H), ni = nrm.createImageData(W, H), oi = occ.createImageData(W, H);
  const at = (px: number, py: number) => height[((py + H) % H) * W + Math.min(W - 1, Math.max(0, px))];
  const depth = 0.12 * k; // relief in mm × px/mm: the height field's slope per pixel
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const i = (py * W + px) * 4, hgt = at(px, py), d = Math.min(px, W - 1 - px);
    const isEdge = d < edge, isStitch = !isEdge && Math.abs(d - stitch) < stitchHalf && hgt > 0.36;
    if (isEdge) { ci.data[i] = 10; ci.data[i + 1] = 16; ci.data[i + 2] = 36; }
    else if (isStitch) { ci.data[i] = 26; ci.data[i + 1] = 38; ci.data[i + 2] = 78; }
    const shade = isEdge || isStitch ? 1 : 0.4 + 0.6 * Math.pow(hgt, 0.7);
    ci.data[i] *= shade; ci.data[i + 1] *= shade; ci.data[i + 2] *= shade;
    const r = isEdge ? 0.5 : isStitch ? 0.6 : 0.62 - 0.2 * hgt;
    ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = r * 255; ri.data[i + 3] = 255;
    const o = isEdge ? 1 : 0.15 + 0.85 * Math.min(1, hgt * 1.25);
    oi.data[i] = oi.data[i + 1] = oi.data[i + 2] = o * 255; oi.data[i + 3] = 255;
    const dx = (at(px + 1, py) - at(px - 1, py)) * depth * 0.5, dy = (at(px, py + 1) - at(px, py - 1)) * depth * 0.5;
    const len = Math.hypot(dx, dy, 1);
    ni.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
    ni.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
    ni.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
    ni.data[i + 3] = 255;
  }
  col.putImageData(ci, 0, 0); rough.putImageData(ri, 0, 0); nrm.putImageData(ni, 0, 0); occ.putImageData(oi, 0, 0);
  const t = (c: HTMLCanvasElement, srgb = false) => {
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = THREE.ClampToEdgeWrapping; tx.wrapT = THREE.RepeatWrapping;
    tx.repeat.set(1, 1 / mmV);
    tx.anisotropy = 16;
    if (srgb) tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  };
  return { map: t(cc, true), normalMap: t(nc), roughnessMap: t(rc), aoMap: t(oc) };
}

/** One strap: leaves the case flat, snug against the flank between the lugs, then bends ever more
 *  tightly round toward the wrist. Padded top, flat lining, rounded painted edges; 21.8 → 18.2 mm. */
function strapGeometry(sign: 1 | -1) {
  const L = 38, NI = 140, Rc = R_CASE + 0.05, ds = L / (NI - 1);
  const cy: number[] = [], cz: number[] = [], th: number[] = [];
  let y = Rc, z = -0.35, theta = 0;
  for (let i = 0; i < NI; i++) {
    cy.push(y); cz.push(z); th.push(theta);
    theta += (ds * smooth(0, 6, i * ds)) / 13.5;   // curvature eases in: no kink where it leaves the case
    y += Math.cos(theta) * ds; z -= Math.sin(theta) * ds;
  }
  // section, counter-clockwise: lining, rounded edge, padded top, rounded edge. u runs across the top
  // only; the edges and lining clamp to the painted-edge colour at the texture's sides
  const section = (w: number, t: number) => {
    const hw = w / 2, ht = t / 2, rc = Math.min(0.85, ht * 0.7), pad = 0.28, flat = hw - rc;
    const pts: [number, number, number][] = [];
    const corner = (cx: number, cn: number, a0: number, u: number, n = 8) => {
      for (let k = 1; k <= n; k++) { const a = a0 + (Math.PI / 2) * (k / n); pts.push([cx + rc * Math.cos(a), cn + rc * Math.sin(a), u]); }
    };
    for (let k = 0; k <= 6; k++) pts.push([-flat + (2 * flat * k) / 6, -ht, 1.2]);                     // lining
    corner(flat, -ht + rc, -Math.PI / 2, 1.15);
    for (let k = 1; k <= 3; k++) pts.push([hw, -ht + rc + (2 * (ht - rc) * k) / 3, 1.1]);              // right edge
    corner(flat, ht - rc, 0, 1.05);
    for (let k = 1; k <= 30; k++) { const x = flat - (2 * flat * k) / 30; pts.push([x, ht + pad * (1 - (x / flat) ** 2), 0.5 + x / w]); } // padded top
    corner(-flat, ht - rc, Math.PI / 2, -0.05);
    for (let k = 1; k <= 3; k++) pts.push([-hw, ht - rc - (2 * (ht - rc) * k) / 3, -0.1]);             // left edge
    corner(-flat, -ht + rc, Math.PI, -0.15);
    return pts;
  };
  const NJ = section(20, 3).length;
  const g = surface(NI, NJ, (i, j) => {
    const s = i * ds, f = s / L, w = 21.8 - 3.6 * f, t = 3.0 - 0.7 * f;
    const [x, n, u] = section(w, t)[j];
    // the first 3 mm bend round to follow the case, so the strap end sits snug against the flank
    const back = (Math.sqrt(Rc * Rc - x * x) - Rc) * (1 - smooth(0, 3, s));
    const ny = Math.sin(th[i]), nz = Math.cos(th[i]), ty = Math.cos(th[i]), tz = -Math.sin(th[i]);
    return [[x, sign * (cy[i] + n * ny + back * ty), cz[i] + n * nz + back * tz], u, s + back];
  });
  return outward(g, 2);
}

// ── assembly ────────────────────────────────────────────────────────
export interface PoloParts {
  caseGroup: THREE.Group;     // case middle, lugs, bezel, crown
  straps: readonly [THREE.Mesh, THREE.Mesh]; // top, bottom — they slide off the lugs when exploded
  crystal: THREE.Group;
  back: THREE.Group;          // caseback ring + sapphire
  dialSide: THREE.Group;      // flange + indices + casing ring
  hands: { group: THREE.Group; hour: THREE.Mesh; minute: THREE.Mesh };
}

export function buildPolo(mats: Mats): PoloParts {
  const caseGroup = new THREE.Group(), crystal = new THREE.Group(), back = new THREE.Group(), dialSide = new THREE.Group();
  const A = CUSHION.a;

  // case middle: one section revolved — polished rounded lower edge, horizontally brushed flank with
  // a faint barrel, a polished lip under the bezel; the bore and top are hidden in the assembled watch
  // (only parts whose shadows can be seen cast them: the shadow map is redrawn every other frame, and
  // the case middle, lugs, crown and straps throw shadows nowhere the camera looks)
  caseGroup.add(mesh(revolve(arc('c', 20.25, -1.15, 0.75, -90, 0, 12), 'wrap', 256), mats.roseGold, false));
  caseGroup.add(mesh(revolve([['c', 21.0, -1.15], ['c', 21.035, -0.55], ['c', 21.05, 0.1], ['c', 21.035, 0.75], ['c', 21.0, 1.2]], 'wrap', 256), mats.roseGoldBrushed, false));
  caseGroup.add(mesh(revolve([['c', 21.0, 1.2], ['c', 20.96, 1.31], ['c', 20.9, 1.36]], 'wrap', 256), mats.roseGold, false));
  caseGroup.add(mesh(facets([['c', 20.9, 1.36], ['c', 16.4, 1.36], ['c', 16.4, -1.9], ['c', 20.25, -1.9]], 'wrap', 128), mats.roseGold, false));

  // lugs: lofted out of the flank, polished all over
  caseGroup.add(mesh(mergeGeometries([lugGeometry(1, 1), lugGeometry(-1, 1), lugGeometry(1, -1), lugGeometry(-1, -1)]), mats.roseGold, false));

  // bezel: round outside, cushion inside. Polished outer flank rolling over a rounded edge, a
  // satin top brushed east–west, a crisp polished chamfer down into the opening
  const top = Z.bezelTop;
  caseGroup.add(mesh(revolve([['c', 20.9, 1.37], ['c', 21.0, 1.52], ['c', 21.0, top - 0.6], ...arc('c', 20.4, top - 0.6, 0.6, 0, 90, 14).slice(1)], 'wrap'), mats.roseGold));
  caseGroup.add(mesh(revolve([['c', 20.4, top], ['q', A + 0.55, top]], 'planar'), mats.roseGoldBrushed));
  caseGroup.add(mesh(facets([['q', A + 0.55, top], ['q', A, Z.crystal[1]], ['q', A, Z.caseMid[1] + 0.01], ['c', 20.9, Z.caseMid[1] + 0.01]], 'planar', 512), mats.roseGold));

  // crown: fluted rose gold, the end face engraved with a P in a medallion
  const crownZ = -0.25;
  caseGroup.add(mesh(crownGeometry(crownZ), mats.roseGold, false));
  const faceR = 1.62;
  caseGroup.add(mesh(new THREE.CircleGeometry(faceR, 96).rotateY(Math.PI / 2).translate(23.975, 0, crownZ), crownFaceMaterial(faceR)));

  // strap, and the quick-release pushers on its underside by the case
  const leather = new THREE.MeshPhysicalMaterial({
    ...alligatorMaps(mats.hq), metalness: 0, roughness: 1, specularIntensity: 0.5,
    normalScale: new THREE.Vector2(1, 1),
  });
  const straps = [mesh(strapGeometry(1), leather, false), mesh(strapGeometry(-1), leather, false)] as const;
  const pushers = [-8.6, 8.6].flatMap((x) => [-1, 1].map((sy) =>
    new THREE.CylinderGeometry(0.32, 0.32, 0.22, 24).rotateX(Math.PI / 2).translate(x, sy * 21.2, -1.86)));
  straps[0].add(mesh(mergeGeometries(pushers.filter((_, i) => i % 2 === 1)), mats.steelPolished));
  straps[1].add(mesh(mergeGeometries(pushers.filter((_, i) => i % 2 === 0)), mats.steelPolished));

  // crystal: flat cushion sapphire seated under the chamfer
  const cr = new THREE.ExtrudeGeometry(new THREE.Shape(cushion(A + 0.03, 256)), { depth: Z.crystal[1] - Z.crystal[0] - 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 64 });
  cr.translate(0, 0, Z.crystal[0] + 0.05);
  // faces are AR-coated; the polished edge is not, so it keeps a glint (lifted, the crystal read as a black disc)
  const edge = mats.sapphire.clone();
  edge.specularIntensity = 1;
  edge.specularColor.set(0xffffff);
  const crm = mesh(cr, [mats.sapphire, edge], false);
  crm.renderOrder = 2;
  crystal.add(crm);

  // caseback: a wide circular-brushed ring, engraved, round a sapphire; six screws at 12/2/4/6/8/10.
  // Built in place; its uv is mirrored so the engraving reads the right way round from behind
  back.add(mesh(revolve([['c', 14.15, Z.caseback], ['c', 18.95, Z.caseback]], 'back'), casebackMaterial(mats.hq)));
  back.add(mesh(revolve([...arc('c', 18.95, Z.caseback + 0.55, 0.55, -90, 0, 10), ['c', 19.55, -1.95]], 'wrap'), mats.roseGold));
  back.add(mesh(facets([['c', 19.55, -1.95], ['c', 14.15, -1.95], ['c', 14.15, Z.caseback]], 'wrap'), mats.roseGold));
  back.add(mesh(mergeGeometries([90, 30, -30, -90, -150, 150].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return screw(16.95 * Math.cos(a), 16.95 * Math.sin(a), Z.caseback - 0.01, -1, 0.5);
  })), mats.roseGold));
  const bc = mesh(new THREE.ExtrudeGeometry(new THREE.Shape(circlePts(14.25, 128)), { depth: 0.55, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }).translate(0, 0, -3.1), mats.sapphire, false);
  bc.renderOrder = 2;
  back.add(bc);

  // flange with the minute track, SWISS MADE and the wordmark
  const { tx, R } = flangeTexture(mats.hq);
  mats.flange.map = tx;
  mats.flange.needsUpdate = true;
  dialSide.add(mesh(flangeGeometry(R), mats.flange, false));

  // casing ring: blue, flush with the bridges, filling the cushion's corners round the round movement
  const casing = new THREE.Shape(cushion(A + 0.2, 256));
  casing.holes.push(new THREE.Path(circlePts(15.55)));
  dialSide.add(mesh(new THREE.ExtrudeGeometry(casing, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 64 }).translate(0, 0, 0.6), [mats.pvdBlue, mats.pvdBlueBevel]));

  // applied indices: faceted rose-gold wedges, pointed inside, fixed to the flange at the outer end
  // and cantilevered over the movement
  const indexGeo = ridgedBlade([[0, 0.02, 0.04], [0.6, 0.14, 0.09], [3.3, 0.55, 0.22]], 0.16);
  const idxGeos: THREE.BufferGeometry[] = [];
  for (let h = 0; h < 12; h++) {
    const t = Math.PI / 2 - (h / 12) * TAU;
    const rOut = cushionR(t, A - 1.85);
    idxGeos.push(indexGeo.clone().rotateZ(-Math.PI / 2).translate(rOut - 3.3, 0, 0).rotateZ(t).translate(0, 0, Z.indexBase));
  }
  dialSide.add(mesh(mergeGeometries(idxGeos), mats.roseGoldSatin));

  // hands: openworked alpha swords — a polished gold outline, hollow down the middle. No seconds hand.
  const hourGeo = openHand([[-1.8, 0.42], [0, 0.72], [2.0, 0.95], [7.4, 0.72], [9.7, 0.26], [10.6, 0.01]], [2.4, 8.5], 0.3, 0.11);
  const minGeo = openHand([[-2.3, 0.32], [0, 0.55], [2.2, 0.66], [11.2, 0.46], [14.8, 0.16], [15.6, 0.01]], [2.7, 13.2], 0.24, 0.1);
  const hour = mesh(hourGeo, mats.roseGoldSatin); hour.position.z = Z.hour;
  const minute = mesh(minGeo, mats.roseGoldSatin); minute.position.z = Z.minute;
  // the boss stays under the crystal (2.45)
  const boss = new THREE.LatheGeometry([V2(1.0, 0), V2(0.98, 0.09), V2(0.62, 0.17), V2(0.001, 0.2)], 64).rotateX(Math.PI / 2).translate(0, 0, Z.minute + 0.1);
  const hands = new THREE.Group();
  hands.add(hour, minute, mesh(boss, mats.roseGoldSatin));
  return { caseGroup, straps, crystal, back, dialSide, hands: { group: hands, hour, minute } };
}

// ── ridged parts: hands and indices are two facets meeting at a centre ridge ───────────────
/** A symmetric blade along +y. `stations` = [y, halfWidth, ridgeHeight]; base thickness `t`.
 *  Flat-shaded so each facet catches light as one plane, like a diamond-cut index. */
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
