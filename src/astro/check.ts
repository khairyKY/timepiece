// Self-check: `npm run check`. Fails loudly if the maths behind the watch drifts.
import { strict as assert } from 'node:assert';
import { TRAIN, MOTION, RPS, BEATS_PER_SEC, VPH, trainTime, balanceDeg, forkDeg } from '../watch/train.ts';
import { sunAltitude, sunTimes, skyAt, contrast, over, mix, SCRIM, type Place } from './sky.ts';

const near = (a: number, b: number, tol: number, msg: string) => assert(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

// ── Train: the 3 Hz arithmetic every modelled wheel follows ──
assert.equal((TRAIN.centre / TRAIN.thirdPinion) * (TRAIN.third / TRAIN.fourthPinion), 60, 'centre → fourth = 60');
near(RPS.fourth, 1 / 60, 1e-15, 'fourth wheel turns once a minute');
near(Math.abs(RPS.escape) * TRAIN.escape * 2, BEATS_PER_SEC, 1e-12, 'escape teeth × 2 = beats');
assert.equal(BEATS_PER_SEC * 3600, VPH);
assert.equal((MOTION.minuteWheel / MOTION.cannon) * (MOTION.hourWheel / MOTION.minutePinion), 12, 'motion works 12:1');
near(RPS.hour, 1 / 43200, 1e-15, 'hour wheel once per 12 h');
// train is locked between beats, and advances exactly one beat per beat
near(trainTime(100 + 0.5 / 6), trainTime(100 + 0.9 / 6), 1e-12, 'locked mid-beat');
near(trainTime(100 + 1.5 / 6) - trainTime(100 + 0.5 / 6), 1 / 6, 1e-12, 'one beat per beat');
// balance crosses centre on the beat; fork is parked outside the lift window
near(balanceDeg(7 / 6), 0, 1e-6, 'balance at centre on beat');
near(Math.abs(forkDeg(balanceDeg(7 / 6 + 1 / 24))), 7, 1e-9, 'fork parked at quarter swing');

// ── Sun ──
const cairo: Place = { lat: 30.05, lon: 31.25, label: 'Cairo', exact: false };
const eq = sunTimes(new Date('2026-09-23T10:00Z'), cairo);
near(sunAltitude(eq.noon, cairo), 90 - 30.05, 1, 'Cairo equinox noon altitude ≈ 90° − lat');
assert(eq.sunrise && eq.sunset && eq.sunrise < eq.noon && eq.noon < eq.sunset, 'sunrise < noon < sunset');
const polar = sunTimes(new Date('2026-12-21T12:00Z'), { lat: 69.65, lon: 18.96, label: 'Tromsø', exact: false });
assert(polar.alwaysDown && polar.sunrise === null, 'polar night: no sunrise, no crash');

// ── Living Sky: body text ≥ 4.5:1 at every sun altitude, over zenith, horizon and between ──
let worst = Infinity, worstAt = 0;
for (let alt = -30; alt <= 90; alt += 0.25) {
  const s = skyAt(alt);
  // sky colours, plus pure white and black: copy can sit over polished steel or shadow
  for (const bg of [s.zenith, s.horizon, mix(s.zenith, s.horizon, 0.5), '#ffffff', '#000000']) {
    const c = contrast(s.text, over(bg, s.scrim, SCRIM));
    if (c < worst) [worst, worstAt] = [c, alt];
  }
}
assert(worst >= 4.5, `text contrast ${worst.toFixed(2)} at ${worstAt}°`);

console.log(`ok · worst text contrast ${worst.toFixed(2)}:1 at ${worstAt}°`);
