# 0001. Render the Grand Complication as a full 3D object (three.js)

- Status: accepted
- Date: 2026-09-28

## Context
Kai wants the showpiece to be *photoreal* as well as mechanically, astronomically and precision-detailed. Three options were weighed: full 3D (WebGL), lit 2D (layered SVG + CSS parallax), or a hybrid (SVG face, WebGL movement on the back). Every gear, hand and readout is built inside whichever renderer is chosen, so switching later means rebuilding the piece.

## Decision
Full 3D with **three.js**. The watch is one real 3D object: extruded steel gears turning behind a sapphire crystal with refraction and reflections; the visitor can drag to turn it over and see the movement through an exhibition caseback. Dial text and complication scales are drawn crisp onto 3D surfaces (canvas textures).

Default assumptions that ride with this (reversible, not separate ADRs):
- **Procedural geometry** — case, gears, bridges, hands are generated in code (lathe / extrude from tooth profiles), not a downloaded model. Keeps gear ratios real and driven by the clock, and avoids model licensing on a portfolio piece.
- **No HDR asset** — reflections from a generated studio environment (`RoomEnvironment` + PMREM).
- **Quality tier** — lower pixel ratio and no transmission on weak GPUs / phones; `prefers-reduced-motion` stops the ambient camera motion, not the time.

### Addendum — 2026-09-28, v2 (Piaget Polo Skeleton replica)
Re-checked when the subject became a real watch: no ready-made or licensed 3D model of the Polo Skeleton exists on the major marketplaces, and a static bought mesh couldn't animate its train at true rates anyway. Procedural stays; fidelity now comes from reference photos + published specs (`docs/research-polo.md`).

## Consequences
- Easy: true depth, flip-to-caseback, light sweeping across metal — the "who built this?" moment.
- Hard: text legibility on 3D surfaces (needs high-res canvas textures + careful camera framing), performance on low-end phones, ~150 KB of library before any of our code.
- Rules out: an SVG-only build and a no-JS fallback. Without WebGL, the page shows a static notice, not a degraded clock.
