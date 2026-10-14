// The movement's timekeeping, as pure numbers. Reference: Unitas/ETA 6497-2.
// See docs/research-2026-09-28.md for sources.

export const VPH = 21_600;                  // beats per hour
export const BEATS_PER_SEC = VPH / 3600;    // 6
export const BALANCE_HZ = VPH / 7200;       // 3 full swings a second
export const LIFT_DEG = 44;                 // 6497 lift angle
export const AMPLITUDE_DEG = 275;
export const FORK_DEG = 7;                  // pallet fork swing between banking pins

export const TRAIN = {
  barrel: 75, centrePinion: 10,             // stand-in (Marvin 18,000 vph train); 6497 barrel unpublished
  centre: 80, thirdPinion: 10,
  third: 60, fourthPinion: 8,
  fourth: 120, escapePinion: 10,
  escape: 15,
} as const;

// Motion works under the dial: standard 3 × 4 = 12:1 (not 6497-verified)
export const MOTION = { cannon: 12, minuteWheel: 36, minutePinion: 10, hourWheel: 40 } as const;

// Revolutions per second, viewed from the dial. + = clockwise. Meshing gears alternate direction.
const centre = 1 / 3600;
const third = -centre * (TRAIN.centre / TRAIN.thirdPinion);
const fourth = -third * (TRAIN.third / TRAIN.fourthPinion);
export const RPS = {
  barrel: -centre * (TRAIN.centrePinion / TRAIN.barrel),
  centre,
  third,
  fourth,
  escape: -fourth * (TRAIN.fourth / TRAIN.escapePinion),
  minuteWheel: -centre * (MOTION.cannon / MOTION.minuteWheel),
  hour: centre / 12,
} as const;

/** Seconds since local midnight, quantised to beats: the whole train is locked between beats
 *  and jumps half an escape tooth on each one. */
export function trainTime(s: number): number {
  const b = s * BEATS_PER_SEC;
  const k = Math.floor(b);
  const u = b - k;
  // ponytail: real recoil+drop lasts ~8 ms — shorter than a frame — so a fast ease is all that's visible
  const e = u < 0.06 ? (u / 0.06) * (u / 0.06) * (3 - (2 * u) / 0.06) : 1;
  return (k + e) / BEATS_PER_SEC;
}

/** Balance angle in degrees. Crosses zero exactly on each beat (k / 6 s). */
export const balanceDeg = (s: number) => AMPLITUDE_DEG * Math.sin(2 * Math.PI * BALANCE_HZ * s);

/** Pallet fork angle: parked on a banking pin, flips only inside the lift window around centre. */
export function forkDeg(balance: number) {
  const half = LIFT_DEG / 2;
  return FORK_DEG * Math.max(-1, Math.min(1, balance / half));
}

/** Clockwise angle (radians) a wheel has turned at train time `t`. */
export const wheelAngle = (rps: number, t: number) => 2 * Math.PI * ((rps * t) % 1);
