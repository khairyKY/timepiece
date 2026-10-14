import * as THREE from 'three';
import type { Mats } from './materials';
import { buildPolo, CUSHION } from './polo';
import { buildCalibre, CALIBRE_ANCHORS } from './calibre';
import { RPS, trainTime, wheelAngle } from './train';

// v2: the Piaget Polo Skeleton. Case + dial side in polo.ts, movement in calibre.ts; this file
// stacks them into layers that pull apart along the axis in their real assembly order.

export type LayerName = 'crystal' | 'hands' | 'dial' | 'works' | 'balance' | 'bridges' | 'train' | 'case' | 'plate' | 'rotor' | 'back' | 'strapTop' | 'strapBottom';
/** Travel (mm along the axis) of each layer at full explode. The movement lifts OUT of the case, as in a\n *  watchmaker's exploded drawing: crystal → hands → dial side → movement top-down, then the case middle\n *  drops below it and the caseback below that — so the movement floats clear instead of through the ring. */
export const EXPLODE: Record<LayerName, number> = {
  crystal: 44, hands: 36.5, dial: 30, works: 24, balance: 18.5, bridges: 13, train: 7.5, plate: 2, rotor: -4,
  case: -17, back: -28,
  strapTop: 28, strapBottom: -28,
};
/** Straps unclip and slide off the lugs (along y) instead of moving along the axis. */
export const EXPLODE_AXIS: Partial<Record<LayerName, 'y'>> = { strapTop: 'y', strapBottom: 'y' };

/** Watch-local points the story camera frames. */
export const ANCHORS = {
  centre: new THREE.Vector3(0, 0, 0),
  bezelCorner: new THREE.Vector3(-0.7071 * CUSHION.a, 0.7071 * CUSHION.a, 2.6),
  rotor: CALIBRE_ANCHORS.rotor,
};

export interface Watch {
  root: THREE.Group;
  layers: Record<LayerName, THREE.Group>;
  /** s = seconds since local midnight; gravityLocal = world gravity in the watch's own frame */
  update(s: number, dt: number, gravityLocal: THREE.Vector3): void;
}

export function buildWatch(mats: Mats): Watch {
  const root = new THREE.Group();
  const layers = Object.fromEntries(
    (Object.keys(EXPLODE) as LayerName[]).map((n) => { const g = new THREE.Group(); g.name = n; root.add(g); return [n, g]; }),
  ) as Record<LayerName, THREE.Group>;

  const polo = buildPolo(mats);
  layers.case.add(polo.caseGroup);
  layers.strapTop.add(polo.straps[0]);
  layers.strapBottom.add(polo.straps[1]);
  layers.crystal.add(polo.crystal);
  layers.back.add(polo.back);
  layers.dial.add(polo.dialSide);
  layers.hands.add(polo.hands.group);

  const cal = buildCalibre(mats);
  layers.bridges.add(cal.front);
  layers.balance.add(cal.balance);
  layers.train.add(cal.train);
  layers.plate.add(cal.plate);
  layers.rotor.add(cal.back);
  layers.works.add(cal.works);

  return {
    root,
    layers,
    update(s, dt, gravityLocal) {
      const t = trainTime(s);
      // hours and minutes only, like the real Polo Skeleton: minute on the cannon pinion,
      // hour through the 12:1 motion works
      polo.hands.minute.rotation.z = -wheelAngle(RPS.centre, t);
      polo.hands.hour.rotation.z = -wheelAngle(RPS.hour, t);
      cal.update(s, gravityLocal, dt);
    },
  };
}
