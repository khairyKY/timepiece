import * as THREE from 'three';

/** A product-photography studio, rendered once into PMREM for reflections. Polished metal only looks
 *  like metal when it reflects hard light *and* dark: RoomEnvironment's even grey box made everything
 *  read as plastic, and hard-edged white planes read as CG. Real softboxes are brightest in the middle
 *  and feather off at the edges — that falloff is most of what makes a polished bevel look photographed. */
export function studioScene() {
  const s = new THREE.Scene();

  // the room: dim graded grey, a little lighter toward the floor (black walls turned polished steel
  // into black chrome and gold into bronze)
  s.add(new THREE.Mesh(
    new THREE.SphereGeometry(60, 64, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP;
        void main() {
          float h = normalize(vP).y;
          vec3 c = mix(vec3(0.050, 0.053, 0.060), vec3(0.020, 0.021, 0.025), smoothstep(-0.3, 0.8, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  ));

  const softbox = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color() }, soft: { value: 0.3 }, round: { value: 0 } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 color; uniform float soft; uniform float round; varying vec2 vUv;
      void main() {
        vec2 d = abs(vUv - 0.5) * 2.0;
        float box = (1.0 - smoothstep(1.0 - soft, 1.0, d.x)) * (1.0 - smoothstep(1.0 - soft, 1.0, d.y));
        float disc = 1.0 - smoothstep(1.0 - soft, 1.0, length(d));
        float hot = mix(0.7, 1.0, 1.0 - 0.5 * dot(d, d));   // a diffuser is hottest in the middle
        gl_FragColor = vec4(color * mix(box, disc, round) * hot, 1.0);
      }`,
  });
  const panel = (w: number, h: number, intensity: number, at: [number, number, number], opts: { color?: number; soft?: number; round?: boolean } = {}) => {
    const m = softbox.clone();
    m.uniforms.color.value = new THREE.Color(opts.color ?? 0xffffff).multiplyScalar(intensity);
    m.uniforms.soft.value = opts.soft ?? 0.3;
    m.uniforms.round.value = opts.round ? 1 : 0;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.set(...at);
    p.lookAt(0, 0, 0);
    s.add(p);
  };
  // the camera always looks down −z, so faces turned toward it reflect what is behind the camera
  panel(15, 8, 4.5, [-5, 7, 7]);                              // key softbox, high front-left
  panel(20, 15, 1.1, [0, 12, 0.5], { soft: 0.6 });            // broad overhead: keeps satin faces lit between highlights
  panel(1.4, 15, 11, [9.5, 0.5, 3], { soft: 0.45 });          // tall strip, right: the long line down the case flank
  panel(1.2, 14, 6, [-9.5, 0, -3], { soft: 0.45 });           // tall strip, left rear: rim light
  panel(15, 0.9, 6, [0, 9, -5], { soft: 0.5 });               // top strip, behind: an edge on bezels and bridges
  // a big cool diffuser behind the camera, its lower edge just above the straight-back reflection
  // line: faces square to the camera grade softly into it instead of mirroring one flat sheet
  panel(18, 8, 1.2, [0, 6.5, 11.5], { color: 0xf1f4ff, soft: 0.55 });
  panel(26, 26, 0.22, [0, -11, 0], { color: 0xe8e6e2, soft: 0.8 }); // neutral floor bounce (a warm one browned the lugs)
  // two small hard kickers: the pin-point glints on polished bevels, jewels and screw heads
  panel(1.1, 1.1, 40, [6, 8, 6], { round: true, soft: 0.25 });
  panel(0.9, 0.9, 28, [-8, -3, 8], { round: true, soft: 0.25 });
  return s;
}
