import { getPosition } from 'suncalc';
import zones from './zones.json' with { type: 'json' };

// suncalc v2: degrees everywhere, altitude includes refraction, non-events are null.

export interface Place { lat: number; lon: number; label: string; exact: boolean }

const ZONES: Record<string, number[]> = zones;

/** Best guess from the time zone — no permission prompt. */
export function guessPlace(tz = Intl.DateTimeFormat().resolvedOptions().timeZone): Place {
  const hit = ZONES[tz];
  const city = tz.split('/').pop()!.replace(/_/g, ' ');
  if (hit) return { lat: hit[0], lon: hit[1], label: city, exact: false };
  // ponytail: no latitude without a table hit; equator + offset longitude is the honest floor
  return { lat: 0, lon: -new Date().getTimezoneOffset() / 4, label: 'your time zone', exact: false };
}

export const sunAltitude = (d: Date, p: Place) => getPosition(d, p.lat, p.lon).altitude;

// ── Living Sky palette ──────────────────────────────────────────────
// Stops keyed on sun altitude (degrees): [altitude, zenith, horizon].
// Brand tokens: night #0B1020 · dusk #3A2B4A → #C9785A · day #C9D6E3 · moon #E8E4D8.
const STOPS: [number, string, string][] = [
  [-90, '#070B18', '#0B1020'],
  [-18, '#070B18', '#0B1020'],
  [-12, '#0B1020', '#182044'],
  [-6, '#141A38', '#3A2B4A'],
  [-2, '#232A52', '#8A5560'],
  [0, '#34406E', '#C9785A'],
  [4, '#6F86AE', '#D9A585'],
  [10, '#A7BCD4', '#C9D6E3'],
  [30, '#B5C8DC', '#D4DEE8'],
  [90, '#B9CBDE', '#D8E1EA'],
];
export const MOON = '#E8E4D8';
export const INK = '#0B1020';

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
const toHex = (c: RGB) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gam = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

// OKLab mix so twilight doesn't go muddy between stops
function toOklab([r, g, b]: RGB): RGB {
  [r, g, b] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L, a, b]: RGB): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
export function mix(a: string, b: string, t: number): string {
  const A = toOklab(hex(a)), B = toOklab(hex(b));
  return toHex(fromOklab([0, 1, 2].map((i) => A[i] + (B[i] - A[i]) * t) as RGB));
}

export function luminance(h: string) {
  const [r, g, b] = hex(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** `fg` at `alpha` composited over `bg` — sRGB space, the way the browser blends. */
export function over(bg: string, fg: string, alpha: number) {
  const B = hex(bg), F = hex(fg);
  return toHex([0, 1, 2].map((i) => B[i] + (F[i] - B[i]) * alpha) as RGB);
}

/** Scrim strength at the centre of a text block. Pulls any sky toward a safe backdrop. */
export const SCRIM = 0.72;

export function skyAt(altitude: number) {
  let i = STOPS.findIndex(([a]) => a > altitude);
  if (i <= 0) i = i === 0 ? 1 : STOPS.length - 1;
  const [a0, z0, h0] = STOPS[i - 1];
  const [a1, z1, h1] = STOPS[i];
  const t = Math.min(1, Math.max(0, (altitude - a0) / (a1 - a0)));
  const zenith = mix(z0, z1, t);
  const horizon = mix(h0, h1, t);
  // text: whichever of moon / ink reads better against the zenith (most of the viewport)
  const light = contrast(MOON, zenith) >= contrast(INK, zenith);
  const text = light ? MOON : INK;
  const scrim = mix(zenith, light ? INK : '#E6ECF2', 0.8);
  const night = Math.min(1, Math.max(0, (-4 - altitude) / 10)); // 0 at −4°, 1 at −14°
  return { zenith, horizon, text, scrim, night, light };
}
