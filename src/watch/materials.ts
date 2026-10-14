import * as THREE from 'three';

// Procedural finishing. Every texture is painted on a canvas at boot — no image assets.
// Geometry UVs are in millimetres (ExtrudeGeometry caps use shape x/y), so texture
// repeat is set per-mm: repeat = 1 / (mm covered by one tile).
// Extruded parts carry two material slots: [0] the faces (grained / striped), [1] the sides and
// bevels (mirror-polished — the anglage that catches a hard line of light).

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement, mmPerTile: number, color = false, rotation = 0) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / mmPerTile, 1 / mmPerTile);
  t.rotation = rotation;
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

/** Côtes de Genève: bands of fine arcs left by a spinning abrasive wheel, each band bright where
 *  the wheel bit and dimmer toward the edge the next band overlaps. Colour + roughness. */
function cotesDeGeneve() {
  const S = 512, band = S / 4; // 4 stripes per 10 mm tile → 2.5 mm stripes
  const [c, g] = canvas(S);
  const [r, rg] = canvas(S);
  for (let x = 0; x < S; x++) {
    const u = (x % band) / band;
    const lit = Math.pow(1 - u, 0.6);            // sharp edge at u=0, falls off across the band
    const v = Math.round(206 + 44 * lit);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x, 0, 1, S);
    const rough = Math.round(40 + 70 * (1 - lit)); // polished where bright, satin at the overlap
    rg.fillStyle = `rgb(${rough},${rough},${rough})`;
    rg.fillRect(x, 0, 1, S);
  }
  // the arcs themselves: large-radius curves stacked along each band
  for (const [ctx, light, dark] of [[g, 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.07)'], [rg, 'rgba(0,0,0,0.10)', 'rgba(255,255,255,0.08)']] as const) {
    ctx.lineWidth = 1;
    for (let b = 0; b < 4; b++) {
      const cx = b * band + band / 2;
      for (let y = -band; y < S + band; y += 3) {
        ctx.strokeStyle = (y / 3) % 2 ? light : dark;
        ctx.beginPath();
        ctx.arc(cx, y - band * 1.6, band * 1.6, Math.PI * 0.32, Math.PI * 0.68);
        ctx.stroke();
      }
    }
  }
  return { map: tex(c, 10, true, 0.35), roughnessMap: tex(r, 10, false, 0.35) };
}

/** Perlage: overlapping circular grain on the main plate — ~1.2 mm circles, each overlapping
 *  its neighbour by a third (the real spec). Colour + roughness. */
function perlage() {
  const S = 512, mm = 8, k = S / mm;
  const [c, g] = canvas(S);
  const [r, rg] = canvas(S);
  g.fillStyle = '#9aa0a8'; g.fillRect(0, 0, S, S);
  rg.fillStyle = '#7a7a7a'; rg.fillRect(0, 0, S, S);
  const rad = 0.6 * k, step = rad * 2 * (2 / 3);
  for (let row = -1, y = -rad; y < S + rad; y += step * 0.87, row++) {
    for (let x = -rad + (row % 2) * step * 0.5; x < S + rad; x += step) {
      for (const [ctx, a, b] of [[g, '#c3c8cf', '#80868e'], [rg, '#303030', '#a0a0a0']] as const) {
        const grd = ctx.createRadialGradient(x - rad * 0.25, y - rad * 0.25, 0, x, y, rad);
        grd.addColorStop(0, a); grd.addColorStop(0.7, b); grd.addColorStop(1, a);
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  return { map: tex(c, mm, true), roughnessMap: tex(r, mm) };
}

/** Circular graining on wheel faces: fine concentric rings around each wheel's own arbor. */
function circularGrain(radius: number) {
  const S = 1024;
  const [c, g] = canvas(S);
  const [r, rg] = canvas(S);
  g.fillStyle = '#e9e9e9'; g.fillRect(0, 0, S, S);
  rg.fillStyle = '#5a5a5a'; rg.fillRect(0, 0, S, S);
  for (let i = 0, rr = 1; rr < S * 0.72; rr += 2.2, i++) {
    g.strokeStyle = i % 2 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.12)';
    rg.strokeStyle = i % 2 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.18)';
    for (const ctx of [g, rg]) { ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(S / 2, S / 2, rr, 0, Math.PI * 2); ctx.stroke(); }
  }
  return { map: centred(c, radius, true), roughnessMap: centred(r, radius) };
}

/** Sunray (soleil): radial brushing from the centre, the classic ratchet-wheel finish. */
function sunray(radius: number) {
  const S = 1024;
  const [r, rg] = canvas(S);
  rg.fillStyle = '#6a6a6a'; rg.fillRect(0, 0, S, S);
  for (let i = 0; i < 720; i++) {
    const a = (i / 720) * Math.PI * 2;
    rg.strokeStyle = i % 2 ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.14)';
    rg.lineWidth = 1.2;
    rg.beginPath(); rg.moveTo(S / 2, S / 2); rg.lineTo(S / 2 + Math.cos(a) * S, S / 2 + Math.sin(a) * S); rg.stroke();
  }
  return { roughnessMap: centred(r, radius) };
}

export interface Mats {
  steelPolished: THREE.MeshPhysicalMaterial;
  steelBrushed: THREE.MeshPhysicalMaterial;
  steelSunray: THREE.MeshPhysicalMaterial;
  rhodiumBridge: THREE.MeshPhysicalMaterial;   // bridge faces, Côtes de Genève
  anglage: THREE.MeshPhysicalMaterial;         // bridge sides + bevels, mirror polish
  rhodiumPlate: THREE.MeshPhysicalMaterial;    // main plate faces, perlage
  gold: THREE.MeshPhysicalMaterial;            // polished gold: wheel edges, hands, chatons
  goldGrained: THREE.MeshPhysicalMaterial;     // wheel faces
  balance: THREE.MeshPhysicalMaterial;
  blued: THREE.MeshPhysicalMaterial;
  ruby: THREE.MeshPhysicalMaterial;
  handGold: THREE.MeshPhysicalMaterial;
  sapphire: THREE.MeshPhysicalMaterial;
  hairspring: THREE.LineBasicMaterial;
  // ── v2: Piaget Polo Skeleton ──
  roseGold: THREE.MeshPhysicalMaterial;        // polished 18k rose gold: chamfers, case band, lugs, indices, hands
  roseGoldBrushed: THREE.MeshPhysicalMaterial; // bezel top: horizontal brushing (anisotropy along the cap's x)
  pvdBlue: THREE.MeshPhysicalMaterial;         // skeleton bridge faces: blue PVD over satin-brushed metal
  pvdBlueBevel: THREE.MeshPhysicalMaterial;    // their polished bevels, a lighter blue
  roseGoldSatin: THREE.MeshPhysicalMaterial;   // hands + indices
  silverWheel: THREE.MeshPhysicalMaterial;     // rhodium-plated wheels, circular grained
  flange: THREE.MeshPhysicalMaterial;          // the lacquered blue rehaut (texture added by the dial side)
}

export function makeMaterials(highQuality: boolean): Mats {
  const metal = (color: number, roughness: number, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
    new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness, ...extra });

  return {
    steelPolished: metal(0xe4e6e8, 0.06),
    // brushed case flank: anisotropic highlight stretched around the case
    steelBrushed: metal(0xd2d5d8, 0.3, { anisotropy: 0.9, anisotropyRotation: Math.PI / 2 }),
    steelSunray: metal(0xdadde0, 1, { ...sunray(4.2) }),
    rhodiumBridge: metal(0xe0e2e4, 1, { ...cotesDeGeneve() }),
    anglage: metal(0xeceef0, 0.05),
    // main plate in ruthenium-grey perlage so the gold train reads against it
    rhodiumPlate: metal(0x6b7078, 1, { ...perlage() }),
    // gold: measured linear (0.944, 0.776, 0.373) ≈ #F9E4A4; gilt wheels a shade warmer
    gold: metal(0xf6dc9a, 0.07),
    goldGrained: metal(0xefcf86, 1, { ...circularGrain(6.5) }),
    balance: metal(0xe6c27e, 0.1),
    // heat-blued steel (~290–300 °C), clearcoat for the glassy oxide layer
    blued: metal(0x2a4bb8, 0.18, { clearcoat: 1, clearcoatRoughness: 0.05 }),
    // synthetic ruby: body colour first. At ~10 px on screen a full-strength clearcoat highlight
    // covered the whole dome (read cream), and transmission showed the silver bridge through it (read pink)
    ruby: new THREE.MeshPhysicalMaterial({
      color: 0xb3002a, roughness: 0.12, metalness: 0, specularIntensity: 0.45,
      clearcoat: 0.7, clearcoatRoughness: 0.04, sheen: 0.4, sheenColor: 0xff3a5c,
    }),
    // hands: polished, but with enough micro-texture to pick up the softbox — mirror-flat they faced
    // the camera, reflected the dim wall and read black
    handGold: metal(0xf6d894, 0.26, { clearcoat: 0.6, clearcoatRoughness: 0.12 }),
    // sapphire crystal: ior 1.77, anti-reflective coated like a real luxury crystal — reflections
    // drop to a faint blue-violet. Without transmission (low tier) fall back to a thin glaze.
    sapphire: highQuality
      ? new THREE.MeshPhysicalMaterial({
          color: 0xffffff, metalness: 0, roughness: 0, transmission: 1, thickness: 1.2, ior: 1.77,
          specularIntensity: 0.35, specularColor: 0xb8c2ff,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0xffffff, metalness: 0, roughness: 0, transparent: true, opacity: 0.1,
          specularIntensity: 0.35, specularColor: 0xb8c2ff,
        }),
    // blued-steel hairspring, dark enough to read as metal rather than glow
    hairspring: new THREE.LineBasicMaterial({ color: 0x3b4f9c }),
    // 18k 5N rose gold: warm copper-pink. Polished parts keep a little roughness so faces that turn
    // toward the camera still read as gold (mirror-flat ones reflected the wall and went dark)
    roseGold: metal(0xf3c2a5, 0.14),
    // brush lines run along u; grooves stretch the highlight ACROSS the grain, so anisotropy points along v
    roseGoldBrushed: metal(0xefbb9d, 1, { ...linearBrush(), anisotropy: 0.85, anisotropyRotation: Math.PI / 2 }),
    // deep royal-navy PVD (the first pass read as bright cartoon blue beside the reference photo)
    pvdBlue: metal(0x1b3688, 0.58, { ...sunburst(16), anisotropy: 0.7 }),
    pvdBlueBevel: metal(0x4a70c4, 0.06),                  // polished edges: the bright outline round each bridge
    // hands, indices, boss: polished but satin enough to catch the softbox and read as gold, not copper-black
    roseGoldSatin: metal(0xf6c9ad, 0.3, { clearcoat: 0.5, clearcoatRoughness: 0.1 }),
    silverWheel: metal(0xdfe2e5, 1, { ...circularGrain(6.5) }),
    flange: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.15, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3 }),
  };
}

/** Sunburst satin (Piaget's finish on the 1200S1 plate and bridges): brushing that radiates from the
 *  movement's centre. An anisotropy *direction* map turns it into real light: each pixel's highlight
 *  stretches across its radial groove, so rays of light fan round the movement as it turns.
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
  const [r, rg] = canvas(S);
  rg.fillStyle = '#5a5a5a'; rg.fillRect(0, 0, S, S);
  let seed = 3;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2400; i++) {
    const ang = rand() * Math.PI * 2;
    rg.strokeStyle = rand() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
    rg.lineWidth = 0.8 + rand();
    rg.beginPath(); rg.moveTo(S / 2, S / 2); rg.lineTo(S / 2 + Math.cos(ang) * S, S / 2 + Math.sin(ang) * S); rg.stroke();
  }
  const anisotropyMap = centred(a, radius);
  anisotropyMap.generateMipmaps = false;
  anisotropyMap.minFilter = THREE.LinearFilter; // direction vectors don't average meaningfully across mips
  return { anisotropyMap, roughnessMap: centred(r, radius) };
}

/** Fine straight brushing, the finish on the Polo's bezel and on satin bridge faces. Roughness only,
 *  lines along the texture's u (cap x) so it pairs with anisotropy on the same axis. */
function linearBrush(lo = 0.2, hi = 0.4) {
  const S = 512;
  const [r, rg] = canvas(S);
  let seed = 5;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < S; y++) {
    const v = Math.round(255 * (lo + (hi - lo) * rand()));
    rg.fillStyle = `rgb(${v},${v},${v})`;
    rg.fillRect(0, y, S, 1);
  }
  return { roughnessMap: tex(r, 3) };
}


/** Square canvas trio (colour / roughness / metalness) mapped onto a disc of `radius` mm
 *  centred on the shape origin. `toPx` converts mm → canvas pixels (y up). */
export function discCanvases(radius: number, size: number, base: { color: string; rough: string; metal: string }) {
  const mk = (fill: string) => {
    const [c, g] = canvas(size);
    g.fillStyle = fill;
    g.fillRect(0, 0, size, size);
    return { c, g };
  };
  const color = mk(base.color), rough = mk(base.rough), metal = mk(base.metal);
  const toPx = (x: number, y: number): [number, number] => [(x / (2 * radius) + 0.5) * size, (0.5 - y / (2 * radius)) * size];
  const pxPerMm = size / (2 * radius);
  const textures = () => {
    const mkT = (c: HTMLCanvasElement, srgb: boolean) => {
      const t = new THREE.CanvasTexture(c);
      t.repeat.set(1 / (2 * radius), 1 / (2 * radius));
      t.offset.set(0.5, 0.5);
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    return { map: mkT(color.c, true), roughnessMap: mkT(rough.c, false), metalnessMap: mkT(metal.c, false) };
  };
  return { color: color.g, rough: rough.g, metal: metal.g, toPx, pxPerMm, textures };
}

/** Aventurine: deep blue glass with copper flecks, painted into a disc-canvas trio. */
export function paintAventurine(d: ReturnType<typeof discCanvases>, size: number, seed = 7) {
  const grd = d.color.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, '#16275c');
  grd.addColorStop(1, '#0a1233');
  d.color.fillStyle = grd;
  d.color.fillRect(0, 0, size, size);
  // seeded so the "sky" is the same on every visit
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const flecks = Math.round(size * size * 0.0035);
  for (let i = 0; i < flecks; i++) {
    const x = rand() * size, y = rand() * size;
    const r = rand() > 0.985 ? 1.6 + rand() * 1.4 : 0.5 + rand() * 0.9;
    const warm = rand();
    d.color.fillStyle = warm > 0.25
      ? `rgba(${200 + warm * 55},${150 + warm * 60},${110 + warm * 60},${0.55 + rand() * 0.45})`
      : 'rgba(220,228,255,0.8)';
    for (const [g, fill] of [[d.color, null], [d.metal, '#fff'], [d.rough, '#141414']] as const) {
      if (fill) g.fillStyle = fill;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }
}

