import { ANCHORS, EXPLODE, type LayerName } from './watch/build';

// One pose per chapter. The watch turns; the camera always sits in front of the target.
export interface Pose {
  rotX: number;
  rotY: number;
  explode: Partial<Record<LayerName, number>>; // 0..1 of each layer's travel
  target: readonly [number, number, number];   // watch-local point to frame
  dist: number;                                // mm
  shift: readonly [number, number];            // where the subject sits: fraction of viewport from centre (+x right, +y up)
}

const at = (v: { x: number; y: number; z: number }) => [v.x, v.y, v.z] as const;
const ALL = Object.fromEntries(Object.keys(EXPLODE).map((k) => [k, 1])) as Record<LayerName, number>;

// ids in index.html, in order: top · case · cushion · skeleton · exploded · rotor · together
export const CHAPTERS: Pose[] = [
  // hero: three-quarter view, subject right of the copy
  { rotX: 0.12, rotY: -0.3, explode: {}, target: at(ANCHORS.centre), dist: 165, shift: [0.2, 0] },
  // 6.5 mm: turned almost edge-on so the thinness is the subject
  { rotX: 0.06, rotY: 1.42, explode: {}, target: at(ANCHORS.centre), dist: 118, shift: [-0.2, 0.02] },
  // the cushion inside the circle: close on the 10:30 corner, brushed bezel and polished chamfer
  { rotX: 0.28, rotY: 0.22, explode: {}, target: at(ANCHORS.bezelCorner), dist: 62, shift: [0.16, 0.12] },
  // the skeleton from the front: the dial is the movement
  { rotX: 0.06, rotY: -0.1, explode: {}, target: at(ANCHORS.centre), dist: 78, shift: [0.25, 0] },
  // 2.4 mm of movement, pulled apart in assembly order
  { rotX: 0.55, rotY: 0.95, explode: ALL, target: [0, 0, 8], dist: 235, shift: [0.13, -0.16] },
  // turned over: the micro-rotor
  { rotX: 0.14, rotY: Math.PI + 0.22, explode: {}, target: at(ANCHORS.rotor), dist: 88, shift: [-0.25, 0] },
  // back together
  { rotX: 0.16, rotY: 0.28, explode: {}, target: at(ANCHORS.centre), dist: 235, shift: [0, 0.25] },
];

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Pose at fractional chapter `p`. Each chapter holds its pose for the middle half of its scroll. */
export function poseAt(p: number): Pose {
  const i = Math.max(0, Math.min(CHAPTERS.length - 2, Math.floor(p)));
  const f = smooth(Math.max(0, Math.min(1, (p - i - 0.25) / 0.5)));
  const a = CHAPTERS[i], b = CHAPTERS[i + 1];
  const explode: Partial<Record<LayerName, number>> = {};
  for (const k of Object.keys(EXPLODE) as LayerName[]) explode[k] = lerp(a.explode[k] ?? 0, b.explode[k] ?? 0, f);
  return {
    rotX: lerp(a.rotX, b.rotX, f),
    rotY: lerp(a.rotY, b.rotY, f),
    explode,
    target: [0, 1, 2].map((j) => lerp(a.target[j], b.target[j], f)) as unknown as Pose['target'],
    dist: lerp(a.dist, b.dist, f),
    shift: [lerp(a.shift[0], b.shift[0], f), lerp(a.shift[1], b.shift[1], f)],
  };
}
