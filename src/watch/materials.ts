import * as THREE from 'three';

// Procedural finishing. Every texture is painted on a canvas at boot — no image assets.
// Geometry UVs are in millimetres, so texture repeat is set per-mm: repeat = 1 / (mm covered by one tile).
// Extruded parts carry two material slots: [0] the faces (grained / brushed), [1] the sides and
// bevels (polished — the anglage that catches a hard line of light).

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!] as const;
}
const lcg = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function tex(c: HTMLCanvasElement, mmPerTile: number, color = false) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / mmPerTile, 1 / mmPerTile);
  t.anisotropy = 16;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** A texture centred on a part's own origin (wheels), covering ±radius mm. */
function centred(c: HTMLCanvasElement, radius: number, color = false) {
  const t = new THREE.CanvasTexture(c);
  t.repeat.set(1 / (2 * radius), 1 / (2 * radius));
  t.offset.set(0.5, 0.5);
  t.anisotropy = 16;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Circular graining on wheel faces: fine concentric rings around each wheel's own arbor, with the
 *  irregular spacing a real graining wheel leaves (an even pitch moirés into rings of light). */
function circularGrain(radius: number) {
  const S = 1024, rand = lcg(11);
  const [c, g] = canvas(S);
  const [r, rg] = canvas(S);
  g.fillStyle = '#e4e6e9'; g.fillRect(0, 0, S, S);
  rg.fillStyle = '#6a6a6a'; rg.fillRect(0, 0, S, S);
  for (let rr = 1; rr < S * 0.72; rr += 0.9 + rand() * 1.6) {
    const light = rand() > 0.5, a = 0.06 + rand() * 0.16;
    g.strokeStyle = light ? `rgba(255,255,255,${a * 1.6})` : `rgba(0,0,0,${a * 0.6})`;
    rg.strokeStyle = light ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
    for (const ctx of [g, rg]) { ctx.lineWidth = 0.8 + rand() * 0.8; ctx.beginPath(); ctx.arc(S / 2, S / 2, rr, 0, Math.PI * 2); ctx.stroke(); }
  }
  return { map: centred(c, radius, true), roughnessMap: centred(r, radius) };
}

/** Sunray (soleil): radial brushing from the centre, the classic ratchet-wheel finish. */
function sunray(radius: number) {
  const S = 1024, rand = lcg(4);
  const [r, rg] = canvas(S);
  rg.fillStyle = '#6a6a6a'; rg.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    const a = rand() * Math.PI * 2;
    rg.strokeStyle = rand() > 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.12)';
    rg.lineWidth = 0.6 + rand();
    rg.beginPath(); rg.moveTo(S / 2, S / 2); rg.lineTo(S / 2 + Math.cos(a) * S, S / 2 + Math.sin(a) * S); rg.stroke();
  }
  return { roughnessMap: centred(r, radius) };
}

/** Sunburst satin (Piaget's finish on the 1200S1 plate and bridges): brushing that radiates from the
 *  movement's centre. An anisotropy *direction* map turns it into real light: each pixel's highlight
 *  stretches across its radial groove, so soft rays fan round the movement as it turns.
 *  UVs are mm with the movement centre at (0,0); covers ±radius mm. */
function sunburst(radius: number) {
  const S = 1024;
  const [a, ag] = canvas(S);
  const img = ag.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - S / 2, dy = S / 2 - y, r = Math.hypot(dx, dy) || 1, i = (y * S + x) * 4;
    // tangential direction (perpendicular to the radial grooves), encoded [-1,1] → [0,255]
    img.data[i] = ((-dy / r) * 0.5 + 0.5) * 255;
    img.data[i + 1] = ((dx / r) * 0.5 + 0.5) * 255;
    img.data[i + 2] = 255;
    img.data[i + 3] = 255;
  }
  ag.putImageData(img, 0, 0);
  // roughness: many faint rays of slightly different grit, so the satin has grain rather than beams
  const [r, rg] = canvas(S), rand = lcg(3);
  rg.fillStyle = '#787878'; rg.fillRect(0, 0, S, S);
  for (let i = 0; i < 6000; i++) {
    const ang = rand() * Math.PI * 2;
    rg.strokeStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    rg.lineWidth = 0.5 + rand() * 1.2;
    rg.beginPath(); rg.moveTo(S / 2, S / 2); rg.lineTo(S / 2 + Math.cos(ang) * S, S / 2 + Math.sin(ang) * S); rg.stroke();
  }
  const anisotropyMap = centred(a, radius);
  anisotropyMap.generateMipmaps = false;
  anisotropyMap.minFilter = THREE.LinearFilter; // direction vectors don't average meaningfully across mips
  return { anisotropyMap, roughnessMap: centred(r, radius) };
}

/** Fine straight brushing: lines along the texture's u, of uneven depth and length, the way a
 *  satin belt leaves them. Roughness only; pairs with anisotropy on the same axis. */
function linearBrush(lo: number, hi: number, mmPerTile = 6) {
  const S = 1024, rand = lcg(5);
  const [r, rg] = canvas(S);
  const mid = Math.round(255 * (lo + hi) / 2);
  rg.fillStyle = `rgb(${mid},${mid},${mid})`; rg.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const v = Math.round(255 * (lo + (hi - lo) * rand())), y = rand() * S, x = rand() * S, len = S * (0.2 + rand() * 0.8);
    rg.strokeStyle = `rgba(${v},${v},${v},0.55)`;
    rg.lineWidth = 0.6 + rand() * 1.1;
    // drawn twice so strokes that run off the right edge wrap round: the tile repeats without a seam
    for (const dx of [0, -S]) { rg.beginPath(); rg.moveTo(x + dx, y); rg.lineTo(x + dx + len, y); rg.stroke(); }
  }
  return { roughnessMap: tex(r, mmPerTile) };
}

export interface Mats {
  hq: boolean;                                 // the high tier: bigger canvases for prints and leather
  steelPolished: THREE.MeshPhysicalMaterial;   // pinions, arbors, levers, screws
  steelSunray: THREE.MeshPhysicalMaterial;     // ratchet wheel
  ruby: THREE.MeshPhysicalMaterial;
  sapphire: THREE.MeshPhysicalMaterial;
  roseGold: THREE.MeshPhysicalMaterial;        // polished 18k 5N rose gold: chamfers, lugs, crown
  roseGoldBrushed: THREE.MeshPhysicalMaterial; // bezel top and case flank: straight satin brushing
  roseGoldSatin: THREE.MeshPhysicalMaterial;   // hands + indices
  pvdBlue: THREE.MeshPhysicalMaterial;         // skeleton plate + bridges: blue PVD over sunburst satin
  pvdBlueBevel: THREE.MeshPhysicalMaterial;    // their polished bevels, a lighter blue
  silverWheel: THREE.MeshPhysicalMaterial;     // rhodium-plated wheels, circular grained
  flange: THREE.MeshPhysicalMaterial;          // the lacquered blue rehaut (texture added by the dial side)
}

export function makeMaterials(highQuality: boolean): Mats {
  const metal = (color: number, roughness: number, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
    new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness, ...extra });

  return {
    hq: highQuality,
    // polished steel: a little grey and a little rough, so small parts reflect the softboxes as
    // soft glints instead of every one blowing out white
    steelPolished: metal(0xd9dce0, 0.14),
    steelSunray: metal(0xd4d7db, 1, { ...sunray(4.2) }),
    // synthetic ruby: deep pinkish red (the 1200S1's stones read rose-violet in photographs), glossy
    // dome. At ~10 px a full-strength clearcoat covered the dome (read cream), and transmission showed
    // the bridge through it (read pink), so: opaque body, a gentle coat
    ruby: new THREE.MeshPhysicalMaterial({
      // a trace of emission stands in for the red fluorescence that makes real jewels glow in photographs
      color: 0xb8124a, emissive: 0x2e000e, roughness: 0.14, metalness: 0, specularIntensity: 0.5,
      clearcoat: 0.5, clearcoatRoughness: 0.03, sheen: 0.4, sheenColor: 0xff5a8c, sheenRoughness: 0.4,
    }),
    // sapphire crystal: ior 1.77, anti-reflective coated like a real luxury crystal. A flat AR crystal
    // passes ~99% of the light, so it is drawn as reflection only, added over what lies behind: faint
    // face-on, rising to a blue-violet sheen at grazing angles. (Transmission re-rendered the whole watch
    // every frame for a refraction offset too small to see through flat glass — it was the single most
    // expensive thing on the page, 75 → 8 ms a frame on a Radeon 660M close-up.)
    sapphire: new THREE.MeshPhysicalMaterial({
      color: 0x000000, metalness: 0, roughness: 0.02, ior: 1.77, specularIntensity: 0.35, specularColor: 0xb8c2ff,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }),
    // 18k 5N rose gold. Polished parts keep a trace of roughness: mirror-flat faces turned toward
    // the camera reflected the dark wall and read black-brown
    roseGold: metal(0xf2bfa2, 0.1),
    // grooves run along u; they stretch the highlight ACROSS the grain, so anisotropy points along v
    roseGoldBrushed: metal(0xf0c0a4, 1, { ...linearBrush(0.2, 0.36), anisotropy: 0.75, anisotropyRotation: Math.PI / 2 }),
    // hands, indices, boss: polished facets with a satin bloom so they read as gold against the blue
    roseGoldSatin: metal(0xf5c6aa, 0.2, { clearcoat: 0.6, clearcoatRoughness: 0.06 }),
    // royal-blue PVD over sunburst satin (iridescence was tried for the thin-film shift: it went purple)
    pvdBlue: metal(0x2a4aa6, 0.5, { ...sunburst(16), anisotropy: 0.32 }),
    pvdBlueBevel: metal(0x5b82d6, 0.07),
    silverWheel: metal(0xdadde1, 1, { ...circularGrain(6.5) }),
    flange: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.08 }),
  };
}
