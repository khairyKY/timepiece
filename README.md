# K. Shaheen · Grand Complication

A mechanical watch built entirely in code: a Unitas 6497-2 gear train turning at its real ratios, tonight's moon, and a dial lit by the sky above the visitor. three.js + TypeScript, no images, no models.

```bash
npm install
npm run dev      # http://localhost:5173 (or the `timepiece` entry in D:\Coding\.claude\launch.json → :5196)
npm run check    # asserts gear ratios, moon vs 2026 eclipses, sun altitude, text contrast
npm run build
```

- `?still` — poses snap instead of easing (same path as `prefers-reduced-motion`). Use it for screenshots.
- `npm run zones` — regenerates `src/astro/zones.json` (timezone → coordinates) from moment-timezone's data.

Where things live: `src/watch/train.ts` (timekeeping maths) · `src/watch/build.ts` (every part) · `src/story.ts` (one camera pose per chapter) · `src/astro/sky.ts` (sun, moon, Living Sky palette) · `src/skyMesh.ts` (the sky, drawn in WebGL so the crystal refracts it).

Why it's built this way: [CONTEXT.md](CONTEXT.md) · [ADR 0001](docs/adr/0001-full-3d-webgl-rendering.md) · [research](docs/research-2026-09-28.md).
