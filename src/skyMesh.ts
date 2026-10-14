import * as THREE from 'three';

// The Living Sky, drawn by WebGL so the sapphire crystal refracts the real sky instead of
// transparent black. A clip-space quad: ignores the camera, sits behind everything, and is
// opaque — so the transmission pass captures it.
export function makeSky() {
  const uniforms = {
    zenith: { value: new THREE.Color('#070B18') },
    horizon: { value: new THREE.Color('#0B1020') },
    night: { value: 1 },
    dpr: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    depthWrite: false,
    depthTest: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith; uniform vec3 horizon; uniform float night; uniform float dpr;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        // zenith holds for the top 60%, then eases into the horizon glow
        vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.6, vUv.y));
        // stars: one chance per 3-css-pixel cell, denser toward the zenith
        vec2 cell = floor(gl_FragCoord.xy / (3.0 * dpr));
        float h = hash(cell);
        float star = step(0.9986, h) * (0.3 + 0.7 * hash(cell + 1.7)) * smoothstep(0.15, 0.9, vUv.y);
        col += vec3(0.91, 0.89, 0.85) * star * night * 0.42;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;

  const target = { zenith: new THREE.Color(), horizon: new THREE.Color(), night: 1 };
  return {
    mesh,
    set(zenith: string, horizon: string, night: number, snap = false) {
      target.zenith.set(zenith);
      target.horizon.set(horizon);
      target.night = night;
      if (snap) { uniforms.zenith.value.copy(target.zenith); uniforms.horizon.value.copy(target.horizon); uniforms.night.value = night; }
    },
    /** ease toward the latest sky; `t` = 0..1 blend for this frame */
    step(t: number, dpr: number) {
      uniforms.zenith.value.lerp(target.zenith, t);
      uniforms.horizon.value.lerp(target.horizon, t);
      uniforms.night.value += (target.night - uniforms.night.value) * t;
      uniforms.dpr.value = dpr;
    },
  };
}
