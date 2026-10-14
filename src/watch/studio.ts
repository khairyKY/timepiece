import * as THREE from 'three';

/** A product-photography studio for reflections: dark room, one big softbox, tall strip lights.
 *  Polished metal only looks like metal when it has hard light *and* dark to reflect —
 *  RoomEnvironment's even grey box made everything read as plastic. Rendered once into PMREM. */
export function studioScene() {
  const s = new THREE.Scene();
  // dim grey walls, not black: pure black turned polished steel into black chrome and gold into bronze
  s.background = new THREE.Color(0x34373e);
  const panel = (w: number, h: number, intensity: number, x: number, y: number, z: number, color = 0xffffff) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  panel(14, 7, 4, -4, 7, 6);           // key softbox, high front-left
  panel(16, 16, 1.2, 0, 11, 1);        // broad overhead panel: keeps faces silver between highlights
  panel(1.1, 14, 12, 9, 0.5, 3);       // tall strip, right: the long highlight down the case flank
  panel(1.1, 14, 7, -9, 0, -3);        // tall strip, left rear: rim light
  panel(14, 0.7, 6, 0, 9, -5);         // top strip, behind: edge on bezels and bridges
  // the camera always looks down −z, so faces turned to it reflect THIS panel: a big diffuser
  // behind the camera, set high so it grades top-to-bottom instead of reading as one flat sheet
  // lower edge sits just above the straight-back reflection line: polished bands mirror the wall,
  // satin bands blur in some softbox — that contrast is what makes Côtes de Genève visible
  panel(18, 8, 1.3, 0, 6.5, 11.5, 0xf2f5ff);
  panel(24, 24, 0.25, 0, -11, 0, 0xe6e6e6); // neutral floor bounce (a warm one browned the lugs)
  return s;
}
