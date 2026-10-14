import * as THREE from 'three';

// All units are millimetres. A watch wheel is a polar outline (teeth) with
// windows cut between hub and rim (the "crossings").

export interface GearSpec {
  teeth: number;
  module: number;          // pitch diameter = module * teeth
  crossings?: number;      // spoke windows; 0 = solid (pinions)
  club?: boolean;          // Swiss-lever escape wheel club teeth
}

export const pitchRadius = (g: GearSpec) => (g.module * g.teeth) / 2;

function toothProfile(u: number, club: boolean): number {
  if (!club) {
    // cycloidal-looking ogive: radial flanks at the root, rounded tip
    const w = 0.46;
    return u < w ? Math.pow(Math.sin((Math.PI * u) / w), 0.55) : 0;
  }
  // club tooth: long curved back, short flat club, near-radial impulse face
  if (u < 0.62) return Math.pow(u / 0.62, 0.8);
  if (u < 0.74) return 1;
  if (u < 0.8) return 1 - (u - 0.74) / 0.06;
  return 0;
}

export function gearShape(g: GearSpec): THREE.Shape {
  const rp = pitchRadius(g);
  const add = g.club ? g.module * 2.6 : g.module * 1.25;
  const ded = g.module * 1.5;
  const rRoot = rp - ded;
  const rTip = rp + add;
  const per = g.club ? 18 : 10;
  const pts: THREE.Vector2[] = [];
  const n = g.teeth * per;
  for (let i = 0; i < n; i++) {
    const t = i / per;
    const u = t - Math.floor(t);
    const f = toothProfile(u, !!g.club);
    const r = rRoot + (rTip - rRoot) * f;
    // club teeth lean forward in the direction of travel
    const skew = g.club ? f * 0.22 : 0;
    const a = (t / g.teeth) * Math.PI * 2 + skew;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const shape = new THREE.Shape(pts);

  const crossings = g.crossings ?? 0;
  const rimIn = rRoot - Math.max(0.35, rp * 0.14);
  const hubOut = Math.max(0.55, rp * 0.2);
  if (crossings > 0 && rimIn - hubOut > 0.4) {
    const spoke = Math.max(0.28, rp * 0.09) / 2;
    const seg = 24;
    for (let k = 0; k < crossings; k++) {
      const a0 = (k / crossings) * Math.PI * 2;
      const a1 = ((k + 1) / crossings) * Math.PI * 2;
      const hole = new THREE.Path();
      // constant-width spokes: shrink the window's angle by asin(w / r) at each radius
      const outerPad = Math.asin(spoke / rimIn);
      const innerPad = Math.asin(Math.min(0.99, spoke / hubOut));
      for (let s = 0; s <= seg; s++) {
        const a = a0 + outerPad + (a1 - a0 - 2 * outerPad) * (s / seg);
        const p = [Math.cos(a) * rimIn, Math.sin(a) * rimIn] as const;
        s === 0 ? hole.moveTo(p[0], p[1]) : hole.lineTo(p[0], p[1]);
      }
      for (let s = seg; s >= 0; s--) {
        const a = a0 + innerPad + (a1 - a0 - 2 * innerPad) * (s / seg);
        hole.lineTo(Math.cos(a) * hubOut, Math.sin(a) * hubOut);
      }
      shape.holes.push(hole);
    }
  }
  const arbor = new THREE.Path();
  arbor.absarc(0, 0, Math.min(0.22, rRoot * 0.4), 0, Math.PI * 2, true);
  shape.holes.push(arbor);
  return shape;
}

/** Extruded wheel. Material slot 0 = faces, slot 1 = sides + chamfer (polish those).
 *  The chamfer is kept under a fifth of the module so fine teeth never fuse shut. */
export function gearGeometry(g: GearSpec, thickness: number): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(gearShape(g), {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: Math.min(0.05, thickness * 0.22),
    bevelSize: Math.min(0.04, g.module * 0.18),
    bevelSegments: 2,
    curveSegments: 12,
  });
  geo.translate(0, 0, -thickness / 2);
  return geo;
}
