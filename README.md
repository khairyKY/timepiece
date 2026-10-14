# Timepiece · Polo Skeleton, a study

A fan study of the Piaget Polo Skeleton (G0A46009), rebuilt part by part in three.js + TypeScript: every wheel turns at its true rate, the micro-rotor swings with gravity, and the backdrop is the real sky above the visitor. No images, no models.

Designed and built by Khairy Shaheen. Not affiliated with or endorsed by Piaget.

```bash
npm install
npm run dev      # http://localhost:5173 (or the `timepiece` entry in D:\Coding\.claude\launch.json → :5196)
npm run check    # asserts gear ratios, moon vs 2026 eclipses, sun altitude, text contrast
npm run build
```

- `?still` — poses snap instead of easing (same path as `prefers-reduced-motion`). Use it for screenshots.

Where things live: `src/watch/train.ts` (timekeeping maths) · `src/watch/build.ts` (every part) · `src/story.ts` (one camera pose per chapter) · `src/astro/sky.ts` (sun, moon, Living Sky palette) · `src/skyMesh.ts` (the sky, drawn in WebGL so the crystal refracts it).

Why it's built this way: [CONTEXT.md](CONTEXT.md) · [ADR 0001](docs/adr/0001-full-3d-webgl-rendering.md) · [research](docs/research-polo.md).
